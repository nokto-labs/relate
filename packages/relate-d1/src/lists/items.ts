import { type SchemaInput, type ObjectSchema, type ListItemsOptions, type PaginatedResult, ValidationError } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { tableName } from '../migrations'
import { rowToRecord } from '../utils'
import { parseFilterClauses } from '../filters'
import { findRecordsPage, countRecords } from '../records/queries'
import { encodeCursor, decodeCursor } from '../cursor'
import { getListOrThrow } from './crud'

function assertStaticList(list: { type: string; id?: string }, action: string): void {
  if (list.type === 'dynamic') {
    throw new ValidationError({ code: 'INVALID_OPERATION', message: `Cannot manually ${action} items ${action === 'add' ? 'to' : 'from'} a dynamic list` })
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

  const now = Date.now()
  await db.batch(
    recordIds.map((recordId) =>
      db
        .prepare('INSERT OR IGNORE INTO relate_list_items (list_id, record_id, added_at) VALUES (?, ?, ?)')
        .bind(listId, recordId, now),
    ),
  )
}

export async function removeFromList(
  db: D1Database,
  listId: string,
  recordIds: string[],
): Promise<void> {
  if (recordIds.length === 0) return

  const list = await getListOrThrow(db, listId)
  assertStaticList(list, 'remove')

  await db.batch(
    recordIds.map((recordId) =>
      db
        .prepare('DELETE FROM relate_list_items WHERE list_id = ? AND record_id = ?')
        .bind(listId, recordId),
    ),
  )
}

function resolveObjectSchema(schema: SchemaInput, list: { object: string; id: string }): ObjectSchema {
  const raw = schema[list.object]
  if (!raw || !('attributes' in raw)) throw new ValidationError({ message: `Unknown object "${list.object}" referenced by list "${list.id}"`, object: list.object, id: list.id })
  return raw as ObjectSchema
}

export async function listItems(
  db: D1Database,
  schema: SchemaInput,
  listId: string,
  options?: ListItemsOptions,
): Promise<PaginatedResult> {
  const list = await getListOrThrow(db, listId)
  const objectSchema = resolveObjectSchema(schema, { object: list.object, id: listId })

  if (list.type === 'dynamic') {
    const mergedFilter = { ...list.filter, ...options?.filter }
    return findRecordsPage(db, list.object, objectSchema, {
      filter: Object.keys(mergedFilter).length > 0 ? mergedFilter : undefined,
      limit: options?.limit,
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
  const limit = options?.limit ?? 50

  const sql = `SELECT r.*, m.added_at as _added_at FROM ${table} r
    INNER JOIN relate_list_items m ON m.record_id = r.id
    ${where}
    ORDER BY m.added_at DESC, r.id DESC
    LIMIT ?`
  bindings.push(limit + 1)

  const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>()
  const hasMore = result.results.length > limit
  const rows = hasMore ? result.results.slice(0, limit) : result.results
  const records = rows.map((row) => rowToRecord(objectSchema, row))

  let nextCursor: string | undefined
  if (hasMore && rows.length > 0) {
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
    const mergedFilter = { ...list.filter, ...filter }
    return countRecords(db, list.object, objectSchema, Object.keys(mergedFilter).length > 0 ? mergedFilter : undefined)
  }

  const clauses: string[] = ['m.list_id = ?']
  const bindings: unknown[] = [listId]

  if (filter) {
    const table = tableName(list.object)
    parseFilterClauses(filter, clauses, bindings, objectSchema)
    const where = `WHERE ${clauses.join(' AND ')}`
    const row = await db
      .prepare(`SELECT COUNT(*) as n FROM ${table} r INNER JOIN relate_list_items m ON m.record_id = r.id ${where}`)
      .bind(...bindings)
      .first<{ n: number }>()
    return row?.n ?? 0
  }

  const row = await db
    .prepare('SELECT COUNT(*) as n FROM relate_list_items WHERE list_id = ?')
    .bind(listId)
    .first<{ n: number }>()
  return row?.n ?? 0
}
