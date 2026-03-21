import { type CRMRecord, type ObjectSchema, type UpsertResult, NotFoundError, ValidationError } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { tableName } from '../migrations'
import { valueToSql, rowToRecord, assertSafeKey } from '../utils'

export async function createRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  attributes: Record<string, unknown>,
): Promise<CRMRecord> {
  const table = tableName(objectSlug)
  const id = crypto.randomUUID()
  const now = Date.now()

  const attrEntries = Object.entries(objectSchema.attributes)
  const cols = ['id', ...attrEntries.map(([k]) => k), 'created_at', 'updated_at']
  const placeholders = cols.map(() => '?').join(', ')
  const values = [
    id,
    ...attrEntries.map(([k, s]) => valueToSql(s, attributes[k], k)),
    now,
    now,
  ]

  await db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).bind(...values).run()

  return rowToRecord(objectSchema, {
    id,
    ...Object.fromEntries(attrEntries.map(([k]) => [k, attributes[k] ?? null])),
    created_at: now,
    updated_at: now,
  })
}

export async function upsertRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  uniqueBy: string,
  attributes: Record<string, unknown>,
): Promise<UpsertResult> {
  assertSafeKey(uniqueBy)
  const table = tableName(objectSlug)
  const uniqueValue = attributes[uniqueBy]
  if (uniqueValue === undefined) {
    throw new ValidationError({ message: `Upsert failed: attribute "${uniqueBy}" is missing`, field: uniqueBy })
  }

  const existing = await db
    .prepare(`SELECT * FROM ${table} WHERE ${uniqueBy} = ? LIMIT 1`)
    .bind(uniqueValue)
    .first<Record<string, unknown>>()

  const now = Date.now()

  if (existing) {
    const attrEntries = Object.entries(attributes)
    const setClauses = attrEntries.map(([k]) => `${k} = ?`).join(', ')
    const values = attrEntries.map(([k, v]) => {
      const attrSchema = objectSchema.attributes[k]
      return attrSchema ? valueToSql(attrSchema, v, k) : v
    })

    await db
      .prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
      .bind(...values, now, existing['id'])
      .run()

    const record = rowToRecord(objectSchema, { ...existing, ...Object.fromEntries(
      Object.entries(attributes).map(([k, v]) => {
        const s = objectSchema.attributes[k]
        return [k, s ? valueToSql(s, v, k) : v]
      })
    ), updated_at: now })

    return { record, isNew: false }
  }

  const record = await createRecord(db, objectSlug, objectSchema, attributes)
  return { record, isNew: true }
}

export async function getRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  id: string,
): Promise<CRMRecord | null> {
  const table = tableName(objectSlug)
  const row = await db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()
  return row ? rowToRecord(objectSchema, row) : null
}

export async function updateRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  id: string,
  attributes: Record<string, unknown>,
): Promise<CRMRecord> {
  const table = tableName(objectSlug)
  const existing = await getRecord(db, objectSlug, objectSchema, id)
  if (!existing) throw new NotFoundError({ code: 'RECORD_NOT_FOUND', object: objectSlug, id }, `Record "${id}" not found in "${objectSlug}"`)

  const attrEntries = Object.entries(attributes)
  const now = Date.now()

  if (attrEntries.length === 0) {
    // Nothing to update, just bump updatedAt
    await db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).bind(now, id).run()
    return { ...existing, updatedAt: new Date(now) } as CRMRecord
  }

  const setClauses = attrEntries.map(([k]) => `${k} = ?`).join(', ')
  const values = attrEntries.map(([k, v]) => {
    const attrSchema = objectSchema.attributes[k]
    return attrSchema ? valueToSql(attrSchema, v, k) : v
  })

  await db
    .prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, id)
    .run()

  return { ...existing, ...attributes, updatedAt: new Date(now) } as CRMRecord
}

export async function deleteRecord(
  db: D1Database,
  objectSlug: string,
  id: string,
): Promise<void> {
  const table = tableName(objectSlug)
  await db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id).run()
}
