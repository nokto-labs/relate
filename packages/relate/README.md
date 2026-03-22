# `@nokto-labs/relate`

Core SDK for defining your domain in TypeScript and working with typed records, refs, relationships, activities, lists, and hooks.

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
| `uniqueBy` | Field used by `upsert()` and duplicate detection |

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
| `update(id, attributes)` | Partially update a record |
| `delete(id)` | Delete a record |

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
| `create(input)` | Create a relationship row |
| `list(ref?, options?)` | List relationships, optionally scoped to a record |
| `update(id, attributes)` | Update relationship attributes |
| `delete(id)` | Delete a relationship |

### Activities client

| Method | Description |
|--------|-------------|
| `track(input)` | Append an activity |
| `list(ref?, options?)` | List activities, optionally scoped to a record |

### Lists client

| Method | Description |
|--------|-------------|
| `create(input)` | Create a list |
| `get(id)` | Get a list by ID |
| `list(options?)` | List all lists |
| `update(id, attrs)` | Update a list's name or filter |
| `delete(id)` | Delete a list |
| `addTo(listId, recordIds)` | Add records to a static list |
| `removeFrom(listId, recordIds)` | Remove records from a static list |
| `items(listId, options?)` | Get list items |
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

### Filter value types

| Attribute type | Filter value |
|----------------|--------------|
| `text`, `email`, `url`, `select`, `ref` | string |
| `number` | number |
| `boolean` | boolean |
| `date` | `Date` |

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
- Recursive hook chains are capped at depth 5

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
