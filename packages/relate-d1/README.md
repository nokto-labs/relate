# @nokto-labs/relate-d1

Cloudflare D1 adapter for [@nokto-labs/relate](https://www.npmjs.com/package/@nokto-labs/relate).

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1
```

```typescript
import { relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { schema } from './schema'

const crm = relate({
  adapter: new D1Adapter(env.DB),
  schema,
})

await crm.migrate()
await crm.person.create({ email: 'alice@acme.com', name: 'Alice' })
```

## Migration helpers

```typescript
import { renameColumn, dropColumn } from '@nokto-labs/relate-d1'

await crm.applyMigrations([
  { id: '001', async up(db) { await renameColumn(db, 'person', 'tier', 'plan') } },
])
```

## Docs

[Full documentation on GitHub](https://github.com/nokto-labs/relate)

## License

MIT
