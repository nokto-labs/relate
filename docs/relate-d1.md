# relate-d1

Cloudflare D1 adapter for Relate.

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1
```

## Setup

```typescript
import { relate, defineSchema } from '@nokto-labs/relate'
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
  adapter: new D1Adapter(db), // pass your D1 binding
  schema,
})

await db.migrate()
```

## Wrangler config

```jsonc
// wrangler.jsonc
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

## Tables

`migrate()` creates these tables automatically:

| Table | Purpose |
|-------|---------|
| `relate_{object}` | One per object (e.g. `relate_person`, `relate_company`) |
| `relate_relationships` | Bidirectional relationships between records |
| `relate_activities` | Immutable event log |
| `relate_lists` | Static and dynamic list definitions |
| `relate_list_items` | Static list membership |
| `relate_migrations` | Migration tracking |

New attributes added to the schema automatically become new columns via `ALTER TABLE ADD COLUMN`.

## Migrations

For structural changes (rename/drop columns), use tracked migrations:

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
- `renameColumn(db, objectSlug, oldName, newName)` — SQLite 3.25+
- `dropColumn(db, objectSlug, columnName)` — SQLite 3.35+

Migrations are idempotent — re-running skips already-applied migrations.

## Type mapping

| Relate type | SQLite type |
|-------------|-------------|
| `text`, `email`, `url`, `select` | `TEXT` |
| `number` | `REAL` |
| `boolean` | `INTEGER` (1/0) |
| `date` | `INTEGER` (ms timestamp) |

## With Cloudflare Workers

```typescript
import { Hono } from 'hono'
import { relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env { DB: D1Database }

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  db: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
}))

export default app
```
