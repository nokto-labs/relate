import { type RelateRecord, type ObjectSchema, type UpsertResult, DuplicateError, NotFoundError, ValidationError } from '@nokto-labs/relate'
import type { D1Database, D1PreparedStatement } from '../d1-types'
import { tableName } from '../migrations'
import { valueToSql, rowToRecord, assertSafeKey } from '../utils'

function serializedAttributes(
  objectSchema: ObjectSchema,
  attributes: Record<string, unknown>,
): Array<[string, unknown]> {
  return Object.entries(attributes).map(([key, value]) => {
    const attrSchema = objectSchema.attributes[key]
    return [key, attrSchema ? valueToSql(attrSchema, value, key) : value]
  })
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'error' in error) {
    const value = (error as { error?: unknown }).error
    if (typeof value === 'string') return value
  }
  return String(error)
}

function maybeThrowDuplicate(
  error: unknown,
  objectSlug: string,
  objectSchema: ObjectSchema,
  attributes: Record<string, unknown>,
): void {
  // D1 does not currently expose a stable structured constraint code here, so we
  // fall back to matching SQLite/D1's duplicate text and the affected index/column.
  if (!objectSchema.uniqueBy) return

  const uniqueValue = attributes[objectSchema.uniqueBy]
  if (uniqueValue === undefined || uniqueValue === null) return

  const table = tableName(objectSlug)
  const message = errorMessage(error)
  if (!message.includes('UNIQUE constraint failed')) return
  if (!message.includes(`${table}.${objectSchema.uniqueBy}`) && !message.includes(`uq_${table}_${objectSchema.uniqueBy}`)) return

  throw new DuplicateError({ object: objectSlug, field: objectSchema.uniqueBy, value: uniqueValue })
}

async function updateExistingRow(
  db: D1Database,
  table: string,
  objectSlug: string,
  objectSchema: ObjectSchema,
  existing: Record<string, unknown>,
  attributes: Record<string, unknown>,
): Promise<RelateRecord> {
  const attrEntries = serializedAttributes(objectSchema, attributes)
  const now = Date.now()

  if (attrEntries.length === 0) {
    await db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).bind(now, existing['id']).run()
    return rowToRecord(objectSchema, { ...existing, updated_at: now })
  }

  const setClauses = attrEntries.map(([key]) => `${key} = ?`).join(', ')
  const values = attrEntries.map(([, value]) => value)

  try {
    await db
      .prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
      .bind(...values, now, existing['id'])
      .run()
  } catch (error) {
    maybeThrowDuplicate(error, objectSlug, objectSchema, attributes)
    throw error
  }

  return rowToRecord(objectSchema, {
    ...existing,
    ...Object.fromEntries(attrEntries),
    updated_at: now,
  })
}

export async function createRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  attributes: Record<string, unknown>,
): Promise<RelateRecord> {
  const id = crypto.randomUUID()
  const now = Date.now()
  const attrEntries = Object.entries(objectSchema.attributes)

  try {
    await createRecordStatement(db, objectSlug, objectSchema, id, attributes, now).run()
  } catch (error) {
    maybeThrowDuplicate(error, objectSlug, objectSchema, attributes)
    throw error
  }

  return rowToRecord(objectSchema, {
    id,
    ...Object.fromEntries(attrEntries.map(([k]) => [k, attributes[k] ?? null])),
    created_at: now,
    updated_at: now,
  })
}

export function createRecordStatement(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  id: string,
  attributes: Record<string, unknown>,
  createdAtMs: number,
): D1PreparedStatement {
  const table = tableName(objectSlug)
  const attrEntries = Object.entries(objectSchema.attributes)
  const cols = ['id', ...attrEntries.map(([key]) => key), 'created_at', 'updated_at']
  const placeholders = cols.map(() => '?').join(', ')
  const values = [
    id,
    ...attrEntries.map(([key, schema]) => valueToSql(schema, attributes[key], key)),
    createdAtMs,
    createdAtMs,
  ]

  return db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`).bind(...values)
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

  if (existing) {
    const record = await updateExistingRow(db, table, objectSlug, objectSchema, existing, attributes)
    return { record, isNew: false }
  }

  try {
    const record = await createRecord(db, objectSlug, objectSchema, attributes)
    return { record, isNew: true }
  } catch (error) {
    if (!(error instanceof DuplicateError)) throw error

    const concurrent = await db
      .prepare(`SELECT * FROM ${table} WHERE ${uniqueBy} = ? LIMIT 1`)
      .bind(uniqueValue)
      .first<Record<string, unknown>>()

    if (!concurrent) throw error

    const record = await updateExistingRow(db, table, objectSlug, objectSchema, concurrent, attributes)
    return { record, isNew: false }
  }
}

export async function getRecord(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  id: string,
): Promise<RelateRecord | null> {
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
): Promise<RelateRecord> {
  const table = tableName(objectSlug)
  const existing = await db
    .prepare(`SELECT * FROM ${table} WHERE id = ?`)
    .bind(id)
    .first<Record<string, unknown>>()
  if (!existing) throw new NotFoundError({ code: 'RECORD_NOT_FOUND', object: objectSlug, id }, `Record "${id}" not found in "${objectSlug}"`)

  return updateExistingRow(db, table, objectSlug, objectSchema, existing, attributes)
}

export function updateRecordStatement(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  id: string,
  attributes: Record<string, unknown>,
  updatedAtMs: number,
): D1PreparedStatement {
  const table = tableName(objectSlug)
  const attrEntries = Object.entries(attributes)

  if (attrEntries.length === 0) {
    return db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).bind(updatedAtMs, id)
  }

  const setClauses = attrEntries.map(([k]) => `${k} = ?`).join(', ')
  const values = attrEntries.map(([k, v]) => {
    const attrSchema = objectSchema.attributes[k]
    return attrSchema ? valueToSql(attrSchema, v, k) : v
  })

  return db
    .prepare(`UPDATE ${table} SET ${setClauses}, updated_at = ? WHERE id = ?`)
    .bind(...values, updatedAtMs, id)
}

export async function deleteRecord(
  db: D1Database,
  objectSlug: string,
  id: string,
): Promise<void> {
  await deleteRecordStatement(db, objectSlug, id).run()
}

export function deleteRecordStatement(
  db: D1Database,
  objectSlug: string,
  id: string,
): D1PreparedStatement {
  const table = tableName(objectSlug)
  return db.prepare(`DELETE FROM ${table} WHERE id = ?`).bind(id)
}
