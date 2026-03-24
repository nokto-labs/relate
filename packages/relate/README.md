# `@nokto-labs/relate`

Core SDK for defining your domain in TypeScript and working with typed records, refs, relationships, activities, lists, hooks, and aggregate queries.

## What You Can Build

- A CRM with contacts, accounts, deals, notes, ownership, and timelines
- An event app with guests, sessions, sponsors, check-ins, and outreach history
- An operations backend for vendors, inventory, orders, approvals, and queues
- A community product with members, orgs, referrals, activities, and saved segments

## Links

- Repository: [github.com/nokto-labs/relate](https://github.com/nokto-labs/relate)
- Package source: [packages/relate](https://github.com/nokto-labs/relate/tree/main/packages/relate)
- Issues: [github.com/nokto-labs/relate/issues](https://github.com/nokto-labs/relate/issues)
- Example: [Cloudflare Worker example](https://github.com/nokto-labs/relate/blob/main/examples/cloudflare-worker.md)

## Install

```bash
npm install @nokto-labs/relate
```

## Quick Start

```typescript
import { defineSchema, relate } from '@nokto-labs/relate'

const schema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        source: 'text',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
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
        value: 'number',
        stage: {
          type: 'select',
          options: ['lead', 'qualified', 'proposal', 'closed_won', 'closed_lost'] as const,
        },
        owner: { type: 'ref', object: 'person', onDelete: 'set_null' },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})

const db = relate({ adapter: myAdapter, schema })

const alice = await db.person.create({ email: 'alice@acme.com', name: 'Alice' })
const acme = await db.company.upsert({ domain: 'acme.com', name: 'Acme' })

await db.relationships.create({
  from: { object: 'person', id: alice.id },
  to: { object: 'company', id: acme.id },
  type: 'works_at',
})
```

## Schema

### Attribute types

- `text`
- `number`
- `boolean`
- `date`
- `email`
- `url`
- `select`
- `ref`

### Object options

| Option | Description |
|--------|-------------|
| `attributes` | Record fields |
| `plural` | REST name, defaults to `slug + "s"` |
| `uniqueBy` | Field used by `upsert()` and duplicate detection; storage adapters can enforce it as a hard uniqueness guarantee |

## Client API

### `db` instance

`relate()` returns one typed object client per schema object plus shared clients and helpers.

| Property / method | Description |
|-------------------|-------------|
| `db.<object>` | Typed object client generated from your schema |
| `db.relationships` | Relationship client |
| `db.activities` | Activity client |
| `db.lists` | Lists client |
| `db.migrate()` | Sync schema to storage |
| `db.applyMigrations(migrations)` | Run tracked custom migrations |
| `db.batch(builder)` | Atomically commit queued record creates and updates when the adapter supports batched mutations |
| `db.webhook(externalId, handler, options?)` | Deduplicate webhook handlers with built-in retry state when the adapter supports it |
| `db.cleanupWebhooks(before?)` | Delete old processed webhook entries when the adapter supports webhook cleanup |
| `db.on(event, handler)` | Register a lifecycle hook |
| `db.off(event, handler)` | Remove a lifecycle hook |

### Object client

| Method | Description |
|--------|-------------|
| `create(attributes)` | Create a record |
| `upsert(attributes)` | Create or update by `uniqueBy` |
| `get(id)` | Get one record by ID |
| `find(options?)` | List records |
| `findPage(options?)` | Cursor-paginated list |
| `count(filter?)` | Count matching records |
| `aggregate(options)` | Count, group, and sum matching records |
| `update(id, attributes)` | Partially update a record |
| `delete(id)` | Delete a record |

### `batch()` atomic writes

Use `db.batch()` when you need several writes to succeed or fail together without dropping to raw SQL.

```typescript
const result = await db.batch((b) => {
  const order = b.deal.create({ title: 'Launch', stage: 'lead' })
  b.deal.update(order.id, { stage: 'won' })
  return { orderId: order.id }
})
```

`batch()` is intentionally a write builder, not a general transaction callback:

- the callback must stay synchronous
- reads such as `get()`, `find()`, and `count()` are not available inside the builder
- v1 supports `create()` and `update()`
- hooks fire only after the full batch commits successfully
- refs can target records created earlier in the same batch by using the returned handle `id`

`batch()` gives you atomicity for the queued write set. It does not solve read-then-write races such as stock checks or counters.

### `webhook()` idempotency helper

Use `db.webhook()` when you want built-in webhook claim state without defining your own `webhookEvent` object.

```typescript
const result = await db.webhook('stripe:evt_123', async () => {
  await db.contact.upsert({ email: 'alice@example.com' })
  await db.deal.create({ title: 'Webhook order' })
  return 'processed'
})
```

Behavior:

- the handler runs only when Relate claims a fresh or retryable webhook key
- already processed keys return `{ executed: false, reason: 'processed' }`
- in-flight keys with an active lease return `{ executed: false, reason: 'processing' }`
- handler errors release the claim and record retry state so a later call can run again
- if a handler runs longer than its lease, another caller can reclaim the key and the original completion update will be ignored
- `db.cleanupWebhooks(before?)` deletes processed webhook rows older than the chosen cutoff

This helper is honest about D1’s limits: it tracks claims, processed timestamps, and retry state, but it is not a true exact-once transaction across crashes. Keep the writes inside your handler idempotent if a crash between side effects and `processedAt` would matter.

You can pass `options.leaseMs` when a handler may legitimately run longer than the default claim lease.

### `find()` options

| Option | Type | Description |
|--------|------|-------------|
| `filter` | object | Filter expression |
| `limit` | number | Maximum rows |
| `offset` | number | Offset pagination |
| `orderBy` | string | Attribute to sort by |
| `order` | `'asc' \| 'desc'` | Sort direction |

### `findPage()` options

| Option | Type | Description |
|--------|------|-------------|
| `filter` | object | Filter expression |
| `limit` | number | Maximum rows |
| `orderBy` | string | Attribute to sort by |
| `order` | `'asc' \| 'desc'` | Sort direction |
| `cursor` | string | Cursor from the previous page |

### Relationships client

| Method | Description |
|--------|-------------|
| `create(input)` | Create a relationship row; declared relationship types are validated against the schema |
| `list(ref?, options?)` | List relationships, optionally scoped to a record |
| `update(id, attributes)` | Update relationship attributes |
| `delete(id)` | Delete a relationship |

### Activities client

| Method | Description |
|--------|-------------|
| `track(input)` | Append an activity for an existing record |
| `list(ref?, options?)` | List activities, optionally scoped to a record |

### Lists client

| Method | Description |
|--------|-------------|
| `create(input)` | Create a list |
| `get(id)` | Get a list by ID |
| `list(options?)` | List all lists |
| `update(id, attrs)` | Update a list's name or filter |
| `delete(id)` | Delete a list |
| `addTo(listId, recordIds)` | Add existing records to a static list |
| `removeFrom(listId, recordIds)` | Remove records from a static list |
| `items(listId, options?)` | Get list items; saved dynamic filters cannot be overridden at read time |
| `count(listId, filter?)` | Count list items |

## Refs

Refs are foreign-key-like attributes stored directly on a record.

```typescript
guest: { type: 'ref', object: 'guest', required: true, onDelete: 'cascade' }
event: { type: 'ref', object: 'event', required: true, onDelete: 'restrict' }
```

### Ref options

| Option | Default | Description |
|--------|---------|-------------|
| `object` | required | Target object slug |
| `required` | `false` | Rejects missing or `null` values |
| `validate` | `true` | Verifies the target record exists on create and update |
| `onDelete` | `'restrict'` | Controls delete behavior |

### `onDelete`

| Value | Behavior |
|-------|----------|
| `restrict` | Block deletion if referencing records exist |
| `cascade` | Recursively delete referencing records |
| `set_null` | Set the ref field to `null` |
| `none` | Leave the ref unchanged |

### Guarantees

- `set_null` with `required: true` is rejected at schema validation time
- Cascade deletes and `set_null` updates emit the same `*.deleted` and `*.updated` hooks as direct operations
- When an adapter supports batched record mutations, the entire cascade plan can be committed atomically
- `@nokto-labs/relate-d1` supports atomic cascade application

## Relationships

When you declare relationship types in `schema.relationships`, `db.relationships.create()` validates that:

- the relationship type exists
- the `from` and `to` objects match the declared shape
- both endpoint records exist

If `schema.relationships` is omitted, relationship `type` remains open-ended and is not schema-validated.

## Filtering

Filters can be written as equality shorthand:

```typescript
await db.person.find({ filter: { tier: 'vip' } })
```

Or with explicit operators:

```typescript
await db.deal.find({
  filter: {
    value: { gte: 10_000 },
    stage: { in: ['lead', 'qualified'] },
  },
})

await db.order.count({
  account: accountId,
  paymentId: { eq: null },
})
```

### Operators

| Operator | SDK shape | Example |
|----------|-----------|---------|
| equality shorthand | `{ field: value }` | `{ tier: 'vip' }` |
| `eq` | `{ field: { eq: value } }` | `{ tier: { eq: 'vip' } }` |
| `ne` | `{ field: { ne: value } }` | `{ tier: { ne: 'trial' } }` |
| `gt` | `{ field: { gt: value } }` | `{ value: { gt: 1000 } }` |
| `gte` | `{ field: { gte: value } }` | `{ value: { gte: 1000 } }` |
| `lt` | `{ field: { lt: value } }` | `{ value: { lt: 5000 } }` |
| `lte` | `{ field: { lte: value } }` | `{ value: { lte: 5000 } }` |
| `in` | `{ field: { in: [...] } }` | `{ stage: { in: ['lead', 'won'] } }` |
| `like` | `{ field: { like: pattern } }` | `{ name: { like: 'Ali%' } }` |

### Null filtering

Optional attributes can be filtered with `null` through the typed SDK:

```typescript
await db.order.find({ filter: { paymentId: null } })
await db.order.count({ paymentId: { eq: null } })
await db.order.find({ filter: { paymentId: { in: [null, 'pay_123'] } } })
```

Notes:

- equality shorthand accepts `null` on optional fields
- `eq`, `ne`, and `in` also accept `null` where the attribute type is optional
- range operators such as `gt` and `lt` stay non-nullable

### Filter value types

| Attribute type | Filter value |
|----------------|--------------|
| `text`, `email`, `url`, `select`, `ref` | string |
| `number` | number |
| `boolean` | boolean |
| `date` | `Date` |

Optional attributes also accept `null` for equality-style filters.

## Aggregates

Use `aggregate()` for grouped counts and numeric sums.

```typescript
const byStage = await db.deal.aggregate({
  filter: { owner: alice.id },
  count: true,
  groupBy: 'stage',
})
// { groups: { lead: 3, qualified: 5, closed_won: 2 } }

const pipelineValue = await db.deal.aggregate({
  filter: { owner: alice.id, stage: { in: ['lead', 'qualified', 'proposal'] } },
  sum: { field: 'value' },
})
// { sum: 125000 }

const revenueByPrice = await db.ticket.aggregate({
  filter: { paymentStatus: 'confirmed' },
  count: true,
  groupBy: 'price',
  sum: { field: 'price.amountCents' },
})
// {
//   groups: { price_basic: 12, price_vip: 3 },
//   groupSums: { price_basic: 240000, price_vip: 180000 },
// }
```

### Aggregate notes

- v1 supports `count`, `sum`, and `groupBy`
- `groupBy` requires `count: true`
- `groupBy` and `sum` can be combined in one call; grouped sums are returned as `groupSums`
- `sum.field` supports direct numeric attributes everywhere
- `sum.field` can also traverse exactly one ref hop, for example `price.amountCents`, when the adapter implements native aggregate joins
- ref sums still typecheck when that ref is optional, for example `price` with `onDelete: 'set_null'`
- `groupBy` stays limited to direct attributes in v2
- If an adapter does not implement native aggregates, Relate falls back to a JavaScript implementation for direct-field aggregates, logs a warning, and loads matching records into memory
- Ref-aware aggregate sums require native adapter support and do not silently fall back to JavaScript joins

## Pagination

```typescript
const page1 = await db.person.findPage({ limit: 20 })
const page2 = await db.person.findPage({ limit: 20, cursor: page1.nextCursor })
```

Use `findPage()` unless you specifically need offset pagination.

## Relationships

```typescript
const rel = await db.relationships.create({
  from: { object: 'person', id: alice.id },
  to: { object: 'company', id: acme.id },
  type: 'works_at',
  attributes: { role: 'CEO' },
})

await db.relationships.list({ object: 'person', id: alice.id })
await db.relationships.update(rel.id, { role: 'CTO' })
await db.relationships.delete(rel.id)
```

## Activities

```typescript
await db.activities.track({
  record: { object: 'deal', id: deal.id },
  type: 'stage_changed',
  metadata: { from: 'lead', to: 'qualified' },
})

await db.activities.list({ object: 'deal', id: deal.id }, { limit: 50 })
```

## Lists

```typescript
const speakers = await db.lists.create({
  name: 'Speakers',
  object: 'person',
  type: 'static',
})

await db.lists.addTo(speakers.id, [alice.id])
await db.lists.items(speakers.id, { limit: 20 })

const bigDeals = await db.lists.create({
  name: 'Big open deals',
  object: 'deal',
  type: 'dynamic',
  filter: { value: { gte: 50_000 }, stage: { in: ['lead', 'qualified', 'proposal'] } },
})

await db.lists.count(bigDeals.id)
```

## Events

```typescript
import { EventBus } from '@nokto-labs/relate'

const events = new EventBus()

events.on('person.created', async ({ record, db }) => {
  await db.person.update(record.id, { source: 'api' })
})

events.on('deal.updated', ({ record, changes }) => {
  if (changes.stage === 'closed_won') {
    console.log(`Deal won: ${record.title}`)
  }
})

const db = relate({ adapter: myAdapter, schema, events })
```

### Event behavior

- `created` handlers receive `{ record, db }`
- `updated` handlers receive `{ record, changes, db }`
- `deleted` handlers receive `{ id, db }`
- Hook errors are isolated and logged
- Recursive hook chains are capped at depth 5 per event name

## Errors

Relate throws structured errors such as:

- `ValidationError`
- `DuplicateError`
- `NotFoundError`
- `RefNotFoundError`
- `RefConstraintError`
- `CascadeDepthError`
- `InvalidSchemaError`

## Migrations

```typescript
await db.migrate()
await db.applyMigrations(migrations)
```

`migrate()` syncs schema structure. `applyMigrations()` runs tracked custom migrations when the adapter supports them.

## Companion packages

- D1 adapter: [@nokto-labs/relate-d1](https://github.com/nokto-labs/relate/tree/main/packages/relate-d1)
- Hono routes: [@nokto-labs/relate-hono](https://github.com/nokto-labs/relate/tree/main/packages/relate-hono)
