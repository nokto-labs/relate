# Example: Cloudflare Worker

A complete REST API running on Cloudflare Workers with D1. Three files.

## schema.ts

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
        currency: 'text',
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

## index.ts

```typescript
import { Hono } from 'hono'
import { relate, EventBus } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env {
  DB: D1Database
}

const events = new EventBus()

events.on('person.created', async ({ record, db }: any) => {
  console.log(`New person: ${record.email}`)
  await db.person.update(record.id, { source: 'api' })
})

events.on('deal.updated', ({ record, changes }: any) => {
  if (changes.stage === 'closed_won') {
    console.log(`Deal won: ${record.title}`)
  }
})

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  events,
  db: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema, events }),
}))

export default app
```

## wrangler.jsonc

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
      // Run: wrangler d1 create my-app — then paste the ID here
      "database_id": ""
    }
  ]
}
```

## What you get

Run `POST /migrate` once, then:

```bash
# People
POST   /people              # create (rejects duplicates)
PUT    /people              # upsert by email
GET    /people              # list, filter, paginate
GET    /people/:id          # get by ID
PATCH  /people/:id          # update
DELETE /people/:id          # delete (cascades relationships + list items)

# Same for /companies, /deals

# Nested ref routes (auto-generated from ref attributes)
GET    /people/:id/deals         # deals owned by person
POST   /people/:id/deals         # create deal with owner = person
GET    /companies/:id/deals      # deals for company

# Relationships
POST   /relationships       # link any two records
GET    /relationships       # list all
GET    /relationships/people/:id  # list for a person

# Activities
POST   /activities          # track events
GET    /activities/deals/:id     # timeline for a deal

# Lists
POST   /lists               # create static or dynamic list
GET    /lists/:id/items     # get items (with filters)
POST   /lists/:id/items     # add items to static list

# Meta
GET    /schema              # introspect schema
POST   /migrate             # run migrations
```

## Filtering examples

```bash
# Equality
GET /people?tier=vip

# Operators
GET /deals?value[gte]=10000&value[lt]=100000
GET /deals?stage[in]=lead,qualified
GET /people?name[like]=Ali%

# Ref filtering
GET /deals?owner=person-id
GET /deals?company[in]=id1,id2

# Cursor pagination
GET /people?limit=20&cursor=eyJ2Ijo...

# Count
GET /deals/count?stage=closed_won
```

## Install

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono hono
npx wrangler d1 create my-app
npx wrangler dev
```
