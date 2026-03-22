import { type Relationship, type CreateRelationshipInput, type ListRelationshipsOptions, NotFoundError } from '@nokto-labs/relate'
import type { D1Database } from './d1-types'

interface RelationshipRow {
  id: string
  from_record_id: string
  from_object: string
  to_record_id: string
  to_object: string
  type: string
  attributes: string
  created_at: number
}

function rowToRelationship(row: RelationshipRow): Relationship {
  const extra = JSON.parse(row.attributes) as Record<string, unknown>
  return {
    id: row.id,
    from: { object: row.from_object, id: row.from_record_id },
    to: { object: row.to_object, id: row.to_record_id },
    type: row.type,
    createdAt: new Date(row.created_at),
    ...extra,
  }
}

export async function createRelationship(
  db: D1Database,
  input: CreateRelationshipInput,
): Promise<Relationship> {
  const id = crypto.randomUUID()
  const now = Date.now()
  await db
    .prepare(
      `INSERT INTO relate_relationships
        (id, from_record_id, from_object, to_record_id, to_object, type, attributes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.from.id,
      input.from.object,
      input.to.id,
      input.to.object,
      input.type,
      JSON.stringify(input.attributes ?? {}),
      now,
    )
    .run()
  return {
    id,
    from: input.from,
    to: input.to,
    type: input.type,
    createdAt: new Date(now),
    ...(input.attributes ?? {}),
  }
}

export async function listRelationships(
  db: D1Database,
  ref?: { object: string; id: string },
  options?: ListRelationshipsOptions,
): Promise<Relationship[]> {
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (ref) {
    clauses.push('((from_record_id = ? AND from_object = ?) OR (to_record_id = ? AND to_object = ?))')
    bindings.push(ref.id, ref.object, ref.id, ref.object)
  }

  if (options?.type) {
    clauses.push('type = ?')
    bindings.push(options.type)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  let sql = `SELECT * FROM relate_relationships ${where} ORDER BY created_at DESC`

  if (options?.limit !== undefined) {
    sql += ' LIMIT ?'
    bindings.push(options.limit)
  }

  const result = await db.prepare(sql).bind(...bindings).all<RelationshipRow>()
  return result.results.map(rowToRelationship)
}

export async function deleteRelationship(db: D1Database, id: string): Promise<void> {
  await db.prepare('DELETE FROM relate_relationships WHERE id = ?').bind(id).run()
}

export async function updateRelationship(
  db: D1Database,
  id: string,
  attributes: Record<string, unknown>,
): Promise<Relationship> {
  const existing = await db
    .prepare('SELECT * FROM relate_relationships WHERE id = ?')
    .bind(id)
    .first<RelationshipRow>()
  if (!existing) throw new NotFoundError({ code: 'RELATIONSHIP_NOT_FOUND', id }, `Relationship "${id}" not found`)

  const merged = { ...JSON.parse(existing.attributes) as Record<string, unknown>, ...attributes }
  await db
    .prepare('UPDATE relate_relationships SET attributes = ? WHERE id = ?')
    .bind(JSON.stringify(merged), id)
    .run()

  return rowToRelationship({ ...existing, attributes: JSON.stringify(merged) })
}
