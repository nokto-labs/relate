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

const crm = relate({
  adapter: new D1Adapter(db), // pass your D1 binding
  schema,
})

await crm.migrate()
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
| `crm_{object}` | One per object (e.g. `crm_person`, `crm_company`) |
| `crm_relationships` | Bidirectional relationships between records |
| `crm_activities` | Immutable event log |
| `crm_lists` | Static and dynamic list definitions |
| `crm_list_items` | Static list membership |
| `crm_migrations` | Migration tracking |

New attributes added to the schema automatically become new columns via `ALTER TABLE ADD COLUMN`.

## Migrations

For structural changes (rename/drop columns), use tracked migrations:

```typescript
import { renameColumn, dropColumn } from '@nokto-labs/relate-d1'

await crm.applyMigrations([
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
  crm: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
}))

export default app
```
