# Relate

A CRM SDK for developers. Define your schema in code, get a fully typed API instantly.

```typescript
import { createCRM, defineSchema, EventBus } from '@nokto-labs/relate'
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

const events = new EventBus()
events.on('person.created', ({ record }: any) => console.log(`Welcome ${record.name}`))

app.route('/', relateRoutes({
  schema,
  events,
  crm: (c) => createCRM({ adapter: new D1Adapter(c.env.DB), schema, events }),
}))
```

Records, relationships, activities, lists, filtering, cursor pagination, hooks, migrations, structured errors — all from one schema.

## Packages

| Package | Purpose | Docs |
|---------|---------|------|
| `@nokto-labs/relate` | Core SDK | [docs/relate.md](docs/relate.md) |
| `@nokto-labs/relate-d1` | Cloudflare D1 adapter | [docs/relate-d1.md](docs/relate-d1.md) |
| `@nokto-labs/relate-hono` | Hono REST API | [docs/relate-hono.md](docs/relate-hono.md) |

## Example

Full Cloudflare Worker CRM in 3 files: [docs/example.md](docs/example.md)

## License

MIT
