# Relate

Define your domain in TypeScript. Get a typed SDK, refs, relationships, activities, lists, hooks, and an optional REST API for Cloudflare.

Relate is built around a simple idea:

1. Define your objects with `defineSchema()`
2. Create a database client with `relate()`
3. Optionally expose the same model as HTTP routes with `relateRoutes()`

## Packages

| Package | Purpose |
|---------|---------|
| [`@nokto-labs/relate`](packages/relate) | Core SDK: schema, records, refs, relationships, activities, lists, hooks, errors |
| [`@nokto-labs/relate-d1`](packages/relate-d1) | Cloudflare D1 adapter |
| [`@nokto-labs/relate-hono`](packages/relate-hono) | Hono route generator |

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
    company: {
      plural: 'companies',
      attributes: {
        domain: { type: 'text', required: true },
        name: 'text',
      },
      uniqueBy: 'domain',
    },
    deal: {
      plural: 'deals',
      attributes: {
        title: { type: 'text', required: true },
        owner: { type: 'ref', object: 'person', onDelete: 'set_null' },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})

const db = relate({
  adapter: new D1Adapter(env.DB),
  schema,
})

await db.migrate()
await db.person.create({ email: 'alice@acme.com', name: 'Alice' })

const app = new Hono()

app.route('/', relateRoutes({
  schema,
  db: (c) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
}))
```

## What You Get

- Typed object clients with `create`, `upsert`, `get`, `find`, `findPage`, `count`, `update`, and `delete`
- `ref` attributes with `restrict`, `cascade`, `set_null`, and `none` delete behavior
- First-class relationships between any records
- Immutable activity timelines
- Static and dynamic lists
- Event hooks for record lifecycle changes
- Schema-driven migrations for tables and columns
- Generated Hono routes for CRUD, refs, relationships, activities, and lists

## Mental Model

Use **objects** for your main record types.

Use **refs** when one record directly owns or points to another:
- `deal.owner`
- `checkin.event`
- `task.project`

Use **relationships** when records are connected but neither side owns the other:
- `person works_at company`
- `user watches issue`
- `person mentors person`

Use **activities** for an append-only timeline:
- stage changes
- emails sent
- comments added
- deployments triggered

Use **lists** for saved views and manual collections:
- "VIP customers"
- "Open deals over 50k"
- "Launch checklist"

## Docs

| Topic | Link |
|-------|------|
| Core SDK | [docs/relate.md](docs/relate.md) |
| D1 adapter | [docs/relate-d1.md](docs/relate-d1.md) |
| Hono routes | [docs/relate-hono.md](docs/relate-hono.md) |
| Full Worker example | [docs/example.md](docs/example.md) |

## Reference

- Full typed client reference: [docs/relate.md](docs/relate.md)
- SDK filter/operator reference: [docs/relate.md](docs/relate.md)
- HTTP filter/query reference: [docs/relate-hono.md](docs/relate-hono.md)

## Start Here

- Read [docs/relate.md](docs/relate.md) if you want to model data and use the SDK directly.
- Read [docs/relate-d1.md](docs/relate-d1.md) if you are wiring Relate to Cloudflare D1.
- Read [docs/relate-hono.md](docs/relate-hono.md) if you want a REST API from your schema.
- Read [docs/example.md](docs/example.md) if you want a complete Worker setup you can copy into a project.

## License

MIT
