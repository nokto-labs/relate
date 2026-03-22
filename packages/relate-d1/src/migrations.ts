import type { D1Database } from './d1-types'
import type { SchemaInput, ObjectSchema, AttributeSchema, Migration } from '@nokto-labs/relate'

// ─── Shared tables ────────────────────────────────────────────────────────────

const BASE_DDL = [
  `CREATE TABLE IF NOT EXISTS relate_relationships (
    id TEXT PRIMARY KEY,
    from_record_id TEXT NOT NULL,
    from_object TEXT NOT NULL,
    to_record_id TEXT NOT NULL,
    to_object TEXT NOT NULL,
    type TEXT NOT NULL,
    attributes TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_rel_from ON relate_relationships(from_record_id, from_object)`,
  `CREATE INDEX IF NOT EXISTS idx_rel_to ON relate_relationships(to_record_id, to_object)`,

  `CREATE TABLE IF NOT EXISTS relate_activities (
    id TEXT PRIMARY KEY,
    record_id TEXT NOT NULL,
    object_slug TEXT NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_activities_record ON relate_activities(record_id, occurred_at)`,

  `CREATE TABLE IF NOT EXISTS relate_lists (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    object_slug TEXT NOT NULL,
    type TEXT NOT NULL,
    filter TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,

  `CREATE INDEX IF NOT EXISTS idx_lists_object ON relate_lists(object_slug)`,

  `CREATE TABLE IF NOT EXISTS relate_list_items (
    list_id TEXT NOT NULL,
    record_id TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    PRIMARY KEY (list_id, record_id)
  )`,

  `CREATE INDEX IF NOT EXISTS idx_list_members_list ON relate_list_items(list_id, added_at)`,

  `CREATE TABLE IF NOT EXISTS relate_migrations (
    id TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`,
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function tableName(slug: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    throw new Error(`Invalid object slug: "${slug}". Must be lowercase letters, numbers, underscores.`)
  }
  return `relate_${slug}`
}

export function attrToSqlType(schema: AttributeSchema): string {
  const type = typeof schema === 'string' ? schema : schema.type
  switch (type) {
    case 'number': return 'REAL'
    case 'boolean': return 'INTEGER'
    case 'date': return 'INTEGER'
    default: return 'TEXT'
  }
}

// ─── Migration helpers (for use inside Migration.up) ─────────────────────────

/** Rename a column on an object table. Uses ALTER TABLE RENAME COLUMN (SQLite 3.25+). */
export async function renameColumn(db: D1Database, objectSlug: string, oldName: string, newName: string): Promise<void> {
  const table = tableName(objectSlug)
  await db.prepare(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`).run()
}

/** Drop a column from an object table. Uses ALTER TABLE DROP COLUMN (SQLite 3.35+). */
export async function dropColumn(db: D1Database, objectSlug: string, columnName: string): Promise<void> {
  const table = tableName(objectSlug)
  await db.prepare(`ALTER TABLE ${table} DROP COLUMN ${columnName}`).run()
}

// ─── Per-object table migration ───────────────────────────────────────────────

async function migrateObjectTable(
  db: D1Database,
  slug: string,
  objectSchema: ObjectSchema,
): Promise<void> {
  const table = tableName(slug)

  const attrCols = Object.entries(objectSchema.attributes)
    .map(([name, schema]) => `  ${name} ${attrToSqlType(schema)}`)
    .join(',\n')

  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS ${table} (
        id TEXT PRIMARY KEY,
        ${attrCols ? attrCols + ',' : ''}
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
    )
    .run()

  // Add columns for any new attributes added to the schema
  const info = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>()
  const existingCols = new Set(info.results.map((r) => r.name))

  for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
    if (!existingCols.has(attrName)) {
      await db
        .prepare(`ALTER TABLE ${table} ADD COLUMN ${attrName} ${attrToSqlType(attrSchema)}`)
        .run()
    }
  }

  // Auto-index ref columns
  for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
    if (typeof attrSchema === 'object' && (attrSchema as { type: string }).type === 'ref') {
      await db
        .prepare(`CREATE INDEX IF NOT EXISTS idx_${table}_${attrName} ON ${table}(${attrName})`)
        .run()
    }
  }
}

// ─── Main migrate ─────────────────────────────────────────────────────────────

export async function migrate(db: D1Database, schema: SchemaInput): Promise<void> {
  await db.batch(BASE_DDL.map((sql) => db.prepare(sql)))

  for (const [slug, objectSchema] of Object.entries(schema)) {
    if (slug === 'relationships' || !('attributes' in objectSchema)) continue
    await migrateObjectTable(db, slug, objectSchema as ObjectSchema)
  }
}

// ─── User-defined migrations with tracking ───────────────────────────────────

export async function applyMigrations(db: D1Database, migrations: Migration[]): Promise<void> {
  if (migrations.length === 0) return

  // Ensure tracking table exists (safe to call without migrate() first)
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS relate_migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)`
  ).run()

  // Get already-applied migration IDs
  const applied = await db.prepare('SELECT id FROM relate_migrations').all<{ id: string }>()
  const appliedIds = new Set(applied.results.map((r) => r.id))

  for (const migration of migrations) {
    if (appliedIds.has(migration.id)) continue

    await migration.up(db)
    await db
      .prepare('INSERT INTO relate_migrations (id, applied_at) VALUES (?, ?)')
      .bind(migration.id, Date.now())
      .run()
  }
}
