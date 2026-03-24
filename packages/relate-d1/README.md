# `@nokto-labs/relate-d1`

Cloudflare D1 adapter for Relate.

## Links

- Repository: [github.com/nokto-labs/relate](https://github.com/nokto-labs/relate)
- Package source: [packages/relate-d1](https://github.com/nokto-labs/relate/tree/main/packages/relate-d1)
- Issues: [github.com/nokto-labs/relate/issues](https://github.com/nokto-labs/relate/issues)
- Example: [Cloudflare Worker example](https://github.com/nokto-labs/relate/blob/main/examples/cloudflare-worker.md)

## Install

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1
```

## Quick Start

```typescript
import { defineSchema, relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'

interface Env {
  DB: D1Database
}

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

export function makeDb(env: Env) {
  return relate({
    adapter: new D1Adapter(env.DB),
    schema,
  })
}
```

Call `await makeDb(env).migrate()` during setup or before your first write.

## Wrangler binding

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

## What `migrate()` creates

| Table | Purpose |
|-------|---------|
| `relate_{object}` | Object records, for example `relate_person` |
| `relate_relationships` | Relationship rows |
| `relate_activities` | Activity timeline rows |
| `relate_lists` | List definitions |
| `relate_list_items` | Static list membership |
| `relate_migrations` | Applied migration tracking |

When you add a new attribute to a schema, `migrate()` adds the corresponding column automatically.

When an object defines `uniqueBy`, `migrate()` also creates a unique index for that field.

## Type mapping

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

## Aggregate queries on D1

D1 implements Relate aggregates natively with SQL `COUNT(*)`, `SUM(...)`, and `GROUP BY`.

```typescript
const totals = await db.deal.aggregate({
  count: true,
  groupBy: 'stage',
})

const value = await db.deal.aggregate({
  filter: { stage: 'won' },
  sum: { field: 'value' },
})
```

That means D1 avoids the JavaScript fallback path for aggregate queries.

## Transactions on D1

Relate exposes `db.transaction()` at the core SDK level, but `@nokto-labs/relate-d1` does not currently support interactive callback transactions.

```typescript
await db.transaction(async (tx) => {
  // Not supported by the current D1 Workers binding
})
```

Why:

- D1 supports atomic `batch()` execution, which Relate already uses for ref cascade plans
- The current Workers binding does not expose an interactive read-then-write transaction API for callback-style flows
- `D1Adapter` therefore throws an explicit error for `db.transaction()` instead of pretending the callback is atomic

Use raw SQL or D1-specific write patterns when you need a truly atomic read-then-write flow today.

## Tracked migrations

Use `applyMigrations()` for schema changes that are not simple "add a new column" changes.

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

## Worker example

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

## Good to know

- Call `migrate()` during startup or through a setup route before writing records
- `migrate()` is additive; renames and drops belong in `applyMigrations()`
- The adapter stores schema metadata in memory through `setSchema()` so reads and writes work before the next migration run
- Ref cascade plans are atomic on D1, even though interactive `db.transaction()` is not yet supported

## Companion packages

- Core SDK: [@nokto-labs/relate](https://github.com/nokto-labs/relate/tree/main/packages/relate)
- Hono routes: [@nokto-labs/relate-hono](https://github.com/nokto-labs/relate/tree/main/packages/relate-hono)
