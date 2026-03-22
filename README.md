# Relate

Build any record-based app on Cloudflare. Define your domain in TypeScript, get a typed SDK and REST API instantly.

**CRM, helpdesk, inventory, issue tracker, project management** — the pattern is always the same: objects, relationships between them, and what happened to them over time. Relate gives you the primitives so you don't build them from scratch.

## What you get

- **Typed records** — schema-defined objects with validation, filtering, and cursor pagination
- **Relationships** — first-class typed links between any records
- **Activity tracking** — immutable event log per record (state changes, emails, deploys, anything)
- **Lists** — static collections and dynamic saved filters that resolve live
- **Event hooks** — react to record changes with async handlers
- **Auto-migrations** — schema changes become table/column changes automatically
- **REST API** — full CRUD from your schema in one line, via Hono

## Quick start

```typescript
import { defineSchema, relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'

const schema = defineSchema({
  objects: {
    person: {
      attributes: { email: { type: 'email', required: true }, name: 'text' },
      uniqueBy: 'email',
    },
    company: {
      attributes: { domain: { type: 'text', required: true }, name: 'text' },
      uniqueBy: 'domain',
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})

// Use directly
const db = relate({ adapter: new D1Adapter(env.DB), schema })
await db.migrate()
await db.person.create({ email: 'alice@acme.com', name: 'Alice' })

// Or expose as REST API
app.route('/', relateRoutes({
  schema,
  crm: (c) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
}))
```

## Packages

| Package | What it does |
|---------|-------------|
| [`@nokto-labs/relate`](packages/relate) | Core SDK — schema, records, relationships, activities, lists, events, errors |
| [`@nokto-labs/relate-d1`](packages/relate-d1) | Cloudflare D1 storage adapter |
| [`@nokto-labs/relate-hono`](packages/relate-hono) | REST API routes via Hono |

## Docs

| Topic | Link |
|-------|------|
| Core SDK | [docs/relate.md](docs/relate.md) |
| D1 adapter | [docs/relate-d1.md](docs/relate-d1.md) |
| Hono routes | [docs/relate-hono.md](docs/relate-hono.md) |
| Full working example | [docs/example.md](docs/example.md) |

## License

MIT
