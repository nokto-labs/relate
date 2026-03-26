# Relate

Define your domain in TypeScript. Get typed records, refs, relationships, activities, lists, hooks, aggregate queries, and an optional REST API for Cloudflare.

## What You Can Build

- A CRM for people, companies, deals, ownership, and activity history
- An event system for guests, sessions, tickets, check-ins, and follow-up
- An internal tool for vendors, inventory, orders, tasks, and saved views
- A community or directory app with profiles, orgs, relationships, and dynamic lists

Relate has three layers:

1. Define your schema with `defineSchema()`
2. Create a typed client with `relate()`
3. Optionally expose the same model as HTTP routes with `relateRoutes()`

## Packages

| Package | Purpose | Docs |
|---------|---------|------|
| [`@nokto-labs/relate`](packages/relate) | Core SDK | [`packages/relate/README.md`](packages/relate/README.md) |
| [`@nokto-labs/relate-d1`](packages/relate-d1) | Cloudflare D1 adapter | [`packages/relate-d1/README.md`](packages/relate-d1/README.md) |
| [`@nokto-labs/relate-hono`](packages/relate-hono) | Hono route generator | [`packages/relate-hono/README.md`](packages/relate-hono/README.md) |

## Install

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono hono
```

## Quick Start

```typescript
import { Hono } from 'hono'
import { defineSchema, relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'

interface Env {
  DB: D1Database
}

const schema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
      },
      uniqueBy: 'email',
    },
    deal: {
      plural: 'deals',
      attributes: {
        title: { type: 'text', required: true },
        owner: { type: 'ref', object: 'person', onDelete: 'set_null' },
      },
    },
  },
})

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  db: (c) => relate({
    adapter: new D1Adapter(c.env.DB),
    schema,
  }),
}))

export default app
```

## What You Get

- Typed object clients with `create`, `upsert`, `get`, `find`, `findPage`, `count`, `aggregate`, `update`, and `delete`
- Custom ID generation per object with optional prefixes (e.g. `evt_<id>`)
- `ref` attributes with `restrict`, `cascade`, `set_null`, and `none` delete behavior
- Null-aware typed filters for optional attributes
- Atomic `db.batch()` writes for queued record creates and updates
- Built-in `db.webhook()` dedup and retry state for webhook handlers
- One-hop aggregate sums such as `price.amountCents` on native adapters
- First-class relationships between any records
- Immutable activity timelines
- Static and dynamic lists
- Event hooks for record lifecycle changes
- Schema-driven migrations for tables and columns
- Generated Hono routes for CRUD, refs, relationships, activities, and lists
- Scoped Hono record routes for public/admin API surfaces

## Where To Read

- Core SDK and typed client reference: [`packages/relate/README.md`](packages/relate/README.md)
- D1 setup and migration details: [`packages/relate-d1/README.md`](packages/relate-d1/README.md)
- HTTP routes and query syntax: [`packages/relate-hono/README.md`](packages/relate-hono/README.md)
- Cross-package examples: [`examples/README.md`](examples/README.md)

## Examples

| Example | What it shows |
|---------|---------------|
| [`examples/cloudflare-worker.md`](examples/cloudflare-worker.md) | Full Cloudflare Worker with D1 and Hono |

## License

MIT
