# `@nokto-labs/relate-d1`

Cloudflare D1 adapter for Relate.

Use this package when you want to persist a Relate schema in D1 and run it inside Cloudflare Workers.

## Install

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1
```

## Quick Start

```typescript
import { defineSchema, relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'

const schema = defineSchema({
  objects: {
    person: {
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
      },
      uniqueBy: 'email',
    },
  },
})

const db = relate({
  adapter: new D1Adapter(env.DB),
  schema,
})

await db.migrate()
```

## Wrangler Binding

```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app",
      "database_id": "your-database-id"
    }
  ]
}
```

## What `migrate()` Creates

Relate creates one table per object plus a small set of shared tables.

| Table | Purpose |
|-------|---------|
| `relate_{object}` | Object records, for example `relate_person` |
| `relate_relationships` | Relationship rows |
| `relate_activities` | Activity timeline rows |
| `relate_lists` | List definitions |
| `relate_list_items` | Static list membership |
| `relate_migrations` | Applied migration tracking |

When you add a new attribute to a schema, `migrate()` adds the corresponding column automatically.

## Type Mapping

| Relate type | SQLite type |
|-------------|-------------|
| `text`, `email`, `url`, `select` | `TEXT` |
| `ref` | `TEXT` |
| `number` | `REAL` |
| `boolean` | `INTEGER` |
| `date` | `INTEGER` |

### Notes

- `boolean` is stored as `1` / `0`
- `date` is stored as a millisecond timestamp
- `ref` columns are auto-indexed

## Ref guarantees on D1

The D1 adapter supports the stronger ref mutation path:

- Cascade deletes and `set_null` updates are planned first
- The full record-mutation plan is committed through a single D1 `batch()` call
- Hooks fire only after the batch succeeds

That means ref cascades are atomic on D1.

## Tracked Migrations

Use `applyMigrations()` for schema changes that are not simple “add a new column” changes.

```typescript
import { renameColumn, dropColumn } from '@nokto-labs/relate-d1'

await db.applyMigrations([
  {
    id: '001_rename_tier_to_plan',
    async up(db) {
      await renameColumn(db, 'person', 'tier', 'plan')
    },
  },
  {
    id: '002_drop_legacy_source',
    async up(db) {
      await dropColumn(db, 'person', 'source')
    },
  },
])
```

Helpers:

- `renameColumn(db, objectSlug, oldName, newName)`
- `dropColumn(db, objectSlug, columnName)`

Migrations are tracked in `relate_migrations` and only run once.

## Worker Example

```typescript
import { Hono } from 'hono'
import { relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  db: (c: { env: Env }) => relate({
    adapter: new D1Adapter(c.env.DB),
    schema,
  }),
}))

export default app
```

## Good to Know

- Call `migrate()` during startup or through a setup route before writing records
- `migrate()` is additive; renames and drops belong in `applyMigrations()`
- The adapter stores schema metadata in memory through `setSchema()` so reads and writes work before the next migration run
