import { type SchemaInput, type ObjectSchema, type ListItemsOptions, type PaginatedResult, ValidationError } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { tableName } from '../migrations'
import { rowToRecord } from '../utils'
import { parseFilterClauses } from '../filters'
import { findRecords, findRecordsPage, countRecords } from '../records/queries'
import { encodeCursor, decodeCursor } from '../cursor'
import { getListOrThrow } from './crud'
import { normalizeNonNegativeInteger } from '../pagination'

const LIST_BATCH_SIZE = 100

function assertStaticList(list: { type: string; id?: string }, action: string): void {
  if (list.type === 'dynamic') {
    throw new ValidationError({ code: 'INVALID_OPERATION', message: `Cannot manually ${action} items ${action === 'add' ? 'to' : 'from'} a dynamic list` })
  }
}

function resolveObjectSchema(schema: SchemaInput, list: { object: string; id: string }): ObjectSchema {
  const raw = schema[list.object]
  if (!raw || !('attributes' in raw)) throw new ValidationError({ message: `Unknown object "${list.object}" referenced by list "${list.id}"`, object: list.object, id: list.id })
  return raw as ObjectSchema
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]'
}

function chunk<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }

  return chunks
}

function mergeListFilter(
  savedFilter?: Record<string, unknown>,
  requestedFilter?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = { ...(requestedFilter ?? {}) }

  for (const [key, savedValue] of Object.entries(savedFilter ?? {})) {
    const requestedValue = merged[key]
    if (isPlainRecord(savedValue) && isPlainRecord(requestedValue)) {
      merged[key] = { ...requestedValue, ...savedValue }
      continue
    }

    merged[key] = savedValue
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}

async function assertListRecordIdsExist(
  db: D1Database,
  objectSlug: string,
  recordIds: string[],
): Promise<void> {
  const uniqueIds = [...new Set(recordIds)]
  if (uniqueIds.some((recordId) => typeof recordId !== 'string' || recordId.length === 0)) {
    throw new ValidationError({
      message: 'List item IDs must be non-empty strings',
      field: 'recordIds',
    })
  }

  const table = tableName(objectSlug)
  const foundIds = new Set<string>()

  for (const ids of chunk(uniqueIds, LIST_BATCH_SIZE)) {
    const placeholders = ids.map(() => '?').join(', ')
    const result = await db
      .prepare(`SELECT id FROM ${table} WHERE id IN (${placeholders})`)
      .bind(...ids)
      .all<{ id: string }>()

    for (const row of result.results) {
      foundIds.add(row.id)
    }
  }

  const missingIds = uniqueIds.filter((recordId) => !foundIds.has(recordId))
  if (missingIds.length > 0) {
    throw new ValidationError({
      message: `Static lists can only contain existing "${objectSlug}" records`,
      field: 'recordIds',
      object: objectSlug,
      ids: missingIds,
    })
  }
}

export async function addToList(
  db: D1Database,
  listId: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return

  const list = await getListOrThrow(db, listId)
  assertStaticList(list, 'add')
  await assertListRecordIdsExist(db, list.object, recordIds)

  const now = Date.now()
  for (const ids of chunk(recordIds, LIST_BATCH_SIZE)) {
    await db.batch(
      ids.map((recordId) =>
        db
          .prepare('INSERT OR IGNORE INTO relate_list_items (list_id, record_id, added_at) VALUES (?, ?, ?)')
          .bind(listId, recordId, now),
      ),
    )
  }
}

export async function removeFromList(
  db: D1Database,
  listId: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return

  const list = await getListOrThrow(db, listId)
  assertStaticList(list, 'remove')

  for (const ids of chunk(recordIds, LIST_BATCH_SIZE)) {
    await db.batch(
      ids.map((recordId) =>
        db
          .prepare('DELETE FROM relate_list_items WHERE list_id = ? AND record_id = ?')
          .bind(listId, recordId),
      ),
    )
  }
}

export async function listItems(
  db: D1Database,
  schema: SchemaInput,
  listId: string,
  options?: ListItemsOptions,
): Promise<PaginatedResult> {
  const list = await getListOrThrow(db, listId)
  const objectSchema = resolveObjectSchema(schema, { object: list.object, id: listId })
  const limit = normalizeNonNegativeInteger(options?.limit, 'limit')
  const offset = normalizeNonNegativeInteger(options?.offset, 'offset')

  if (options?.cursor && offset !== undefined) {
    throw new ValidationError({
      message: 'Cannot combine cursor and offset pagination',
      field: 'offset',
    })
  }

  if (list.type === 'dynamic') {
    const mergedFilter = mergeListFilter(list.filter, options?.filter)
    if (offset !== undefined) {
      const records = await findRecords(db, list.object, objectSchema, {
        filter: mergedFilter,
        limit,
        offset,
      })
      return { records }
    }

    return findRecordsPage(db, list.object, objectSchema, {
      filter: mergedFilter,
      limit,
      cursor: options?.cursor,
    })
  }

  const table = tableName(list.object)
  const clauses: string[] = ['m.list_id = ?']
  const bindings: unknown[] = [listId]

  if (options?.filter) {
    parseFilterClauses(options.filter, clauses, bindings, objectSchema)
  }

  if (options?.cursor) {
    const { v, id: cursorId } = decodeCursor(options.cursor)
    clauses.push('(m.added_at < ? OR (m.added_at = ? AND r.id < ?))')
    bindings.push(v, v, cursorId)
  }

  const where = `WHERE ${clauses.join(' AND ')}`
  const resolvedLimit = limit ?? 50

  const sql = `SELECT r.*, m.added_at as _added_at FROM ${table} r
    INNER JOIN relate_list_items m ON m.record_id = r.id
    ${where}
    ORDER BY m.added_at DESC, r.id DESC
    LIMIT ?${offset !== undefined ? ' OFFSET ?' : ''}`
  bindings.push(resolvedLimit + 1)
  if (offset !== undefined) bindings.push(offset)

  const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>()
  const hasMore = result.results.length > resolvedLimit
  const rows = hasMore ? result.results.slice(0, resolvedLimit) : result.results
  const records = rows.map((row) => rowToRecord(objectSchema, row))

  let nextCursor: string | undefined
  if (offset === undefined && hasMore && rows.length > 0) {
    const last = rows[rows.length - 1]
    nextCursor = encodeCursor(last['_added_at'], last['id'] as string)
  }

  return { records, nextCursor }
}

export async function countListItems(
  db: D1Database,
  schema: SchemaInput,
  listId: string,
  filter?: Record<string, unknown>,
): Promise<number> {
  const list = await getListOrThrow(db, listId)
  const objectSchema = resolveObjectSchema(schema, { object: list.object, id: listId })

  if (list.type === 'dynamic') {
    return countRecords(db, list.object, objectSchema, mergeListFilter(list.filter, filter))
  }

  const table = tableName(list.object)
  const clauses: string[] = ['m.list_id = ?']
  const bindings: unknown[] = [listId]

  if (filter) {
    parseFilterClauses(filter, clauses, bindings, objectSchema)
  }

  const where = `WHERE ${clauses.join(' AND ')}`
  const row = await db
    .prepare(`SELECT COUNT(*) as n FROM ${table} r INNER JOIN relate_list_items m ON m.record_id = r.id ${where}`)
    .bind(...bindings)
    .first<{ n: number }>()
  return row?.n ?? 0
}
