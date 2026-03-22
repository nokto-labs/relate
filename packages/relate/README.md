# @nokto-labs/relate

Define your domain in TypeScript. Get typed records, relationships, activity tracking, dynamic lists, and a full REST API.

```bash
npm install @nokto-labs/relate
```

```typescript
import { relate, defineSchema, EventBus } from '@nokto-labs/relate'

const schema = defineSchema({
  objects: {
    person: {
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
      },
      uniqueBy: 'email',
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})

const db = relate({ adapter, schema })

await db.person.create({ email: 'alice@acme.com', name: 'Alice', tier: 'vip' })
await db.person.find({ filter: { tier: 'vip' } })
await db.person.findPage({ limit: 20 })
```

Records, relationships, activities, lists, filtering, cursor pagination, hooks, migrations, structured errors — all from one schema.

## Adapters

| Package | Database |
|---------|----------|
| [@nokto-labs/relate-d1](https://www.npmjs.com/package/@nokto-labs/relate-d1) | Cloudflare D1 |

## REST API

| Package | Framework |
|---------|-----------|
| [@nokto-labs/relate-hono](https://www.npmjs.com/package/@nokto-labs/relate-hono) | Hono |

## Docs

[Full documentation on GitHub](https://github.com/nokto-labs/relate)

## License

MIT
