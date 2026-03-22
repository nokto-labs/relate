# Example: Cloudflare Worker

This is a complete Relate setup for Cloudflare Workers with D1 and Hono.

The example has three files:

1. `schema.ts`
2. `index.ts`
3. `wrangler.jsonc`

## `schema.ts`

```typescript
import { defineSchema } from '@nokto-labs/relate'

export const schema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
        source: 'text',
      },
      uniqueBy: 'email',
    },
    company: {
      plural: 'companies',
      attributes: {
        domain: { type: 'text', required: true },
        name: 'text',
        industry: 'text',
        size: 'number',
      },
      uniqueBy: 'domain',
    },
    deal: {
      plural: 'deals',
      attributes: {
        title: { type: 'text', required: true },
        value: 'number',
        stage: {
          type: 'select',
          options: ['lead', 'qualified', 'proposal', 'closed_won', 'closed_lost'] as const,
        },
        owner: { type: 'ref', object: 'person', onDelete: 'set_null' },
        company: { type: 'ref', object: 'company', onDelete: 'set_null' },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})
```

## `index.ts`

```typescript
import { Hono } from 'hono'
import { EventBus, relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env {
  DB: D1Database
}

const events = new EventBus()

events.on('person.created', async ({ record, db }) => {
  console.log(`New person: ${record.email}`)
  await db.person.update(record.id, { source: 'api' })
})

events.on('deal.updated', ({ record, changes }) => {
  if (changes.stage === 'closed_won') {
    console.log(`Deal won: ${record.title}`)
  }
})

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  events,
  db: (c: { env: Env }) => relate({
    adapter: new D1Adapter(c.env.DB),
    schema,
    events,
  }),
}))

export default app
```

## `wrangler.jsonc`

```jsonc
{
  "name": "my-app",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "my-app",
      "database_id": ""
    }
  ]
}
```

Create the D1 database first, then paste the generated ID into `database_id`.

## Install and run

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono hono
npx wrangler d1 create my-app
npx wrangler dev
```

## First request

Run migrations once before writing records:

```bash
curl -X POST http://127.0.0.1:8787/migrate
```

Then create some records:

```bash
curl -X POST http://127.0.0.1:8787/people \
  -H 'content-type: application/json' \
  -d '{"email":"alice@acme.com","name":"Alice","tier":"vip"}'

curl -X POST http://127.0.0.1:8787/companies \
  -H 'content-type: application/json' \
  -d '{"domain":"acme.com","name":"Acme"}'

curl -X POST http://127.0.0.1:8787/deals \
  -H 'content-type: application/json' \
  -d '{"title":"Annual renewal","value":50000}'
```

## Routes you get

### Records

```text
POST   /people
PUT    /people
GET    /people
GET    /people/:id
PATCH  /people/:id
DELETE /people/:id
```

The same pattern is generated for `/companies` and `/deals`.

### Nested ref routes

```text
GET  /people/:id/deals
POST /people/:id/deals
GET  /companies/:id/deals
POST /companies/:id/deals
```

### Relationships, activities, and lists

```text
POST /relationships
GET  /relationships/people/:id

POST /activities
GET  /activities/deals/:id

POST /lists
GET  /lists/:id/items
POST /lists/:id/items
```

## Filtering examples

```text
GET /people?tier=vip
GET /deals?value[gte]=10000&value[lt]=100000
GET /deals?owner=person-id
GET /deals?company[in]=id1,id2
GET /people?limit=20&cursor=eyJ2Ijo...
GET /deals/count?stage=closed_won
```
