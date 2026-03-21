# @nokto-labs/relate-hono

Hono REST API routes for [@nokto-labs/relate](https://www.npmjs.com/package/@nokto-labs/relate). One function gives you a full CRM API.

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono
```

```typescript
import { Hono } from 'hono'
import { createCRM, EventBus } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

const events = new EventBus()
events.on('person.created', ({ record }) => console.log(`Welcome ${record.name}`))

const app = new Hono()

app.route('/', relateRoutes({
  schema,
  events,
  crm: (c) => createCRM({ adapter: new D1Adapter(c.env.DB), schema, events }),
}))

export default app
```

## Options

```typescript
relateRoutes({
  schema,
  crm: (c) => createCRM({ ... }),
  events,                         // shared EventBus
  prefix: '/api/v1',              // prefix all routes
  middleware: [auth],             // run before every route
  maxLimit: 100,                  // cap ?limit=
  routes: { lists: false },       // toggle route groups
})
```

## Docs

[Full documentation on GitHub](https://github.com/nokto-labs/crm)

## License

MIT
