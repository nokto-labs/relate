import { type RelateList, type CreateListInput, type ListListsOptions, NotFoundError, ValidationError } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { type ListRow, rowToList } from './types'
import { normalizeNonNegativeInteger } from '../pagination'

export async function getListOrThrow(db: D1Database, listId: string): Promise<RelateList> {
  const list = await getList(db, listId)
  if (!list) throw new NotFoundError({ code: 'LIST_NOT_FOUND', id: listId }, `List "${listId}" not found`)
  return list
}

export async function createList(
  db: D1Database,
  input: CreateListInput,
): Promise<RelateList> {
  const id = crypto.randomUUID()
  const now = Date.now()

  await db
    .prepare(
      `INSERT INTO relate_lists (id, name, object_slug, type, filter, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.name, input.object, input.type, input.filter ? JSON.stringify(input.filter) : null, now, now)
    .run()

  return {
    id,
    name: input.name,
    object: input.object,
    type: input.type,
    filter: input.filter,
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }
}

export async function getList(
  db: D1Database,
  id: string,
): Promise<RelateList | null> {
  const row = await db
    .prepare('SELECT * FROM relate_lists WHERE id = ?')
    .bind(id)
    .first<ListRow>()
  return row ? rowToList(row) : null
}

export async function listLists(
  db: D1Database,
  options?: ListListsOptions,
): Promise<RelateList[]> {
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (options?.object) {
    clauses.push('object_slug = ?')
    bindings.push(options.object)
  }
  if (options?.type) {
    clauses.push('type = ?')
    bindings.push(options.type)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  let sql = `SELECT * FROM relate_lists ${where} ORDER BY created_at DESC`
  const limit = normalizeNonNegativeInteger(options?.limit, 'limit')
  const offset = normalizeNonNegativeInteger(options?.offset, 'offset')

  if (limit !== undefined) {
    sql += ' LIMIT ?'
    bindings.push(limit)
  }
  if (offset !== undefined) {
    sql += ' OFFSET ?'
    bindings.push(offset)
  }

  const result = await db.prepare(sql).bind(...bindings).all<ListRow>()
  return result.results.map(rowToList)
}

export async function updateList(
  db: D1Database,
  id: string,
  attrs: { name?: string; filter?: Record<string, unknown> },
): Promise<RelateList> {
  const existing = await getListOrThrow(db, id)

  const sets: string[] = []
  const bindings: unknown[] = []

  if (attrs.name !== undefined) {
    sets.push('name = ?')
    bindings.push(attrs.name)
  }
  if (attrs.filter !== undefined) {
    if (existing.type === 'static') {
      throw new ValidationError({ code: 'INVALID_OPERATION', message: 'Cannot set filter on a static list' })
    }
    sets.push('filter = ?')
    bindings.push(JSON.stringify(attrs.filter))
  }

  if (sets.length === 0) return existing

  const now = Date.now()
  sets.push('updated_at = ?')
  bindings.push(now)
  bindings.push(id)

  await db
    .prepare(`UPDATE relate_lists SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...bindings)
    .run()

  return {
    ...existing,
    name: attrs.name ?? existing.name,
    filter: attrs.filter ?? existing.filter,
    updatedAt: new Date(now),
  }
}

export async function deleteList(db: D1Database, id: string): Promise<void> {
  await getListOrThrow(db, id)
  await db.batch([
    db.prepare('DELETE FROM relate_list_items WHERE list_id = ?').bind(id),
    db.prepare('DELETE FROM relate_lists WHERE id = ?').bind(id),
  ])
}
