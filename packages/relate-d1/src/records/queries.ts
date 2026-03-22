import type { RelateRecord, ObjectSchema, FindRecordsOptions, PaginatedResult } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { tableName } from '../migrations'
import { rowToRecord, assertSafeKey } from '../utils'
import { parseFilterClauses } from '../filters'
import { encodeCursor, decodeCursor } from '../cursor'

export async function findRecords(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  options?: FindRecordsOptions,
): Promise<RelateRecord[]> {
  const table = tableName(objectSlug)
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (options?.filter) {
    parseFilterClauses(options.filter, clauses, bindings, objectSchema)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const col = options?.orderBy ?? 'created_at'
  assertSafeKey(col)
  const dir = options?.order === 'asc' ? 'ASC' : 'DESC'
  let sql = `SELECT * FROM ${table} ${where} ORDER BY ${col} ${dir}`

  if (options?.limit !== undefined) {
    sql += ' LIMIT ?'
    bindings.push(options.limit)
  }
  if (options?.offset !== undefined) {
    sql += ' OFFSET ?'
    bindings.push(options.offset)
  }

  const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>()
  return result.results.map((row) => rowToRecord(objectSchema, row))
}

export async function findRecordsPage(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  options?: FindRecordsOptions,
): Promise<PaginatedResult> {
  const table = tableName(objectSlug)
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (options?.filter) {
    parseFilterClauses(options.filter, clauses, bindings, objectSchema)
  }

  const col = options?.orderBy ?? 'created_at'
  assertSafeKey(col)
  const dir = options?.order === 'asc' ? 'ASC' : 'DESC'

  if (options?.cursor) {
    const { v, id: cursorId } = decodeCursor(options.cursor)
    const cmp = dir === 'DESC' ? '<' : '>'
    clauses.push(`(${col} ${cmp} ? OR (${col} = ? AND id ${cmp} ?))`)
    bindings.push(v, v, cursorId)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const limit = options?.limit ?? 50

  const sql = `SELECT * FROM ${table} ${where} ORDER BY ${col} ${dir}, id ${dir} LIMIT ?`
  bindings.push(limit + 1)

  const result = await db.prepare(sql).bind(...bindings).all<Record<string, unknown>>()
  const hasMore = result.results.length > limit
  const rows = hasMore ? result.results.slice(0, limit) : result.results
  const records = rows.map((row) => rowToRecord(objectSchema, row))

  let nextCursor: string | undefined
  if (hasMore && rows.length > 0) {
    const last = rows[rows.length - 1]
    nextCursor = encodeCursor(last[col], last['id'] as string)
  }

  return { records, nextCursor }
}

export async function countRecords(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  filter?: Record<string, unknown>,
): Promise<number> {
  const table = tableName(objectSlug)
  const clauses: string[] = []
  const bindings: unknown[] = []
  if (filter) {
    parseFilterClauses(filter, clauses, bindings, objectSchema)
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const row = await db.prepare(`SELECT COUNT(*) as n FROM ${table} ${where}`).bind(...bindings).first<{ n: number }>()
  return row?.n ?? 0
}
