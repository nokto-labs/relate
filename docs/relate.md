# `@nokto-labs/relate`

Core SDK for defining your domain in TypeScript and working with typed records, refs, relationships, activities, lists, and hooks.

## Install

```bash
npm install @nokto-labs/relate
```

## Start Here

Relate has three main pieces:

1. `defineSchema()` describes your objects
2. `relate()` creates typed clients for those objects
3. An adapter persists everything to a database

```typescript
import { defineSchema, relate } from '@nokto-labs/relate'

const schema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
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
        owner: { type: 'ref', object: 'person', onDelete: 'set_null' },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
  },
})

const db = relate({ adapter, schema })

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

Relate supports these attribute types:

- `text`
- `number`
- `boolean`
- `date`
- `email`
- `url`
- `select`
- `ref`

### Object options

Each object can define:

- `attributes`: the fields on the record
- `plural`: the REST name for the object, defaulting to `slug + "s"`
- `uniqueBy`: the field used by `upsert()` and duplicate detection

```typescript
const schema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        signedUpAt: 'date',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
      },
      uniqueBy: 'email',
    },
  },
})
```

## Records

Every object gets a typed client with the same core methods:

```typescript
const person = await db.person.create({ email: 'alice@acme.com', name: 'Alice' })
const merged = await db.person.upsert({ email: 'alice@acme.com', name: 'Alicia' })
const found = await db.person.get(person.id)
const many = await db.person.find({ filter: { tier: 'vip' } })
const page = await db.person.findPage({ limit: 20 })
const total = await db.person.count({ tier: 'vip' })
await db.person.update(person.id, { name: 'Alice B' })
await db.person.delete(person.id)
```

### Notes

- `create()` validates required fields and rejects duplicates when `uniqueBy` is set
- `upsert()` requires `uniqueBy`
- `update()` validates only the fields you pass
- `findPage()` is cursor-based and is the recommended pagination API

## Client API

### `db` instance

The object returned by `relate()` has one typed object client per schema object plus a few shared clients and helpers.

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

Every schema object gets the same typed client.

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

### `relationships.create()` input

| Field | Type | Description |
|-------|------|-------------|
| `from` | `{ object, id }` | Source record |
| `to` | `{ object, id }` | Target record |
| `type` | string | Relationship type |
| `attributes` | object | Optional custom attributes |

### `relationships.list()` options

| Option | Type | Description |
|--------|------|-------------|
| `type` | string | Filter by relationship type |
| `limit` | number | Maximum rows |

### Activities client

| Method | Description |
|--------|-------------|
| `track(input)` | Append an activity |
| `list(ref?, options?)` | List activities, optionally scoped to a record |

### `activities.track()` input

| Field | Type | Description |
|-------|------|-------------|
| `record` | `{ object, id }` | Record the activity belongs to |
| `type` | string | Activity type |
| `metadata` | object | Optional payload |
| `occurredAt` | `Date` | Optional backdated timestamp |

### `activities.list()` options

| Option | Type | Description |
|--------|------|-------------|
| `type` | string | Filter by activity type |
| `limit` | number | Maximum rows |
| `offset` | number | Offset pagination |
| `before` | `Date` | Return only activities before this date |

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

### `lists.create()` input

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | List name |
| `object` | object slug | Object type stored in the list |
| `type` | `'static' \| 'dynamic'` | List kind |
| `filter` | object | Required for dynamic lists, invalid for static lists |

### `lists.list()` options

| Option | Type | Description |
|--------|------|-------------|
| `object` | string | Filter by object slug |
| `type` | `'static' \| 'dynamic'` | Filter by list kind |
| `limit` | number | Maximum rows |
| `offset` | number | Offset pagination |

### `lists.items()` options

| Option | Type | Description |
|--------|------|-------------|
| `filter` | object | Filter list items |
| `limit` | number | Maximum rows |
| `offset` | number | Offset pagination |
| `cursor` | string | Cursor pagination |

## Refs

Refs are foreign-key-like attributes stored directly on a record.

```typescript
const schema = defineSchema({
  objects: {
    guest: {
      attributes: { name: { type: 'text', required: true } },
    },
    event: {
      attributes: { title: { type: 'text', required: true } },
    },
    checkin: {
      attributes: {
        guest: { type: 'ref', object: 'guest', required: true, onDelete: 'cascade' },
        event: { type: 'ref', object: 'event', required: true, onDelete: 'restrict' },
        status: { type: 'select', options: ['invited', 'confirmed'] as const },
      },
    },
  },
})
```

### Ref options

| Option | Default | Description |
|--------|---------|-------------|
| `object` | required | Target object slug |
| `required` | `false` | Rejects missing or `null` values |
| `validate` | `true` | Verifies the target record exists on create and update |
| `onDelete` | `'restrict'` | Controls what happens when the target record is deleted |

### `onDelete`

| Value | Behavior |
|-------|----------|
| `restrict` | Block deletion if referencing records exist |
| `cascade` | Recursively delete referencing records |
| `set_null` | Set the ref field to `null` |
| `none` | Leave the ref unchanged |

```typescript
await db.checkin.find({ filter: { guest: guestId } })
await db.checkin.find({ filter: { event: { in: [eventA, eventB] } } })
```

### Guarantees

- `set_null` with `required: true` is rejected at schema validation time
- Cascade deletes and `set_null` updates emit the same `*.deleted` and `*.updated` hooks as direct operations
- When an adapter supports batched record mutations, the entire cascade plan can be committed atomically
- The D1 adapter supports atomic cascade application

### Refs vs relationships

Use refs for ownership or parent-child structure:
- `deal.owner`
- `invoice.customer`
- `checkin.event`

Use relationships for looser many-to-many links:
- `person works_at company`
- `user watches issue`
- `person mentors person`

## Filtering

```typescript
await db.person.find({ filter: { tier: 'vip' } })

await db.deal.find({
  filter: {
    value: { gte: 10_000 },
    stage: { in: ['lead', 'qualified'] },
  },
})

await db.person.find({ filter: { name: { like: 'Ali%' } } })
await db.deal.count({ stage: 'won', value: { gt: 50_000 } })
```

Supported operators:

- `eq`
- `ne`
- `gt`
- `gte`
- `lt`
- `lte`
- `in`
- `like`

### Filter reference

You can write filters in two forms:

```typescript
await db.person.find({ filter: { tier: 'vip' } })
await db.person.find({ filter: { tier: { eq: 'vip' } } })
```

Equality shorthand and `eq` are equivalent.

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

Match the filter value to the attribute type:

| Attribute type | Filter value |
|----------------|--------------|
| `text`, `email`, `url`, `select`, `ref` | string |
| `number` | number |
| `boolean` | boolean |
| `date` | `Date` |

### Notes

- `like` is intended for `text`, `email`, `url`, `select`, and `ref`
- `in` accepts arrays of the underlying attribute type
- `count(filter)` uses the same filter shape as `find({ filter })`

## Pagination

```typescript
const page1 = await db.person.findPage({ limit: 20 })
const page2 = await db.person.findPage({ limit: 20, cursor: page1.nextCursor })

await db.person.find({ limit: 10, offset: 20 })
```

Use `findPage()` unless you specifically need offset pagination.

## Relationships

Relationships are first-class records that connect any two objects.

```typescript
const rel = await db.relationships.create({
  from: { object: 'person', id: alice.id },
  to: { object: 'company', id: acme.id },
  type: 'works_at',
  attributes: { role: 'CEO' },
})

await db.relationships.list({ object: 'person', id: alice.id })
await db.relationships.list({ object: 'company', id: acme.id }, { type: 'works_at' })
await db.relationships.update(rel.id, { role: 'CTO' })
await db.relationships.delete(rel.id)
```

Deleting a record automatically removes its relationship rows.

## Activities

Activities give you an append-only timeline for a record.

```typescript
await db.activities.track({
  record: { object: 'deal', id: deal.id },
  type: 'stage_changed',
  metadata: { from: 'lead', to: 'qualified' },
})

await db.activities.track({
  record: { object: 'person', id: alice.id },
  type: 'email_opened',
  metadata: { subject: 'Welcome' },
  occurredAt: new Date('2025-01-15'),
})

await db.activities.list({ object: 'deal', id: deal.id }, { limit: 50, before: new Date() })
```

## Lists

Lists come in two forms:

- static: manually curated record IDs
- dynamic: saved filters that resolve live

```typescript
const speakers = await db.lists.create({
  name: 'Speakers',
  object: 'person',
  type: 'static',
})

await db.lists.addTo(speakers.id, [alice.id, bob.id])
await db.lists.items(speakers.id, { limit: 20 })

const bigDeals = await db.lists.create({
  name: 'Big open deals',
  object: 'deal',
  type: 'dynamic',
  filter: { value: { gte: 50_000 }, stage: { in: ['lead', 'qualified', 'proposal'] } },
})

await db.lists.items(bigDeals.id, { limit: 20 })
await db.lists.count(bigDeals.id)
```

## Events

Pass an `EventBus` into `relate()` to react to lifecycle events.

```typescript
import { EventBus } from '@nokto-labs/relate'

const events = new EventBus()

events.on('person.created', async ({ record, db }) => {
  await sendWelcomeEmail(record.email)
  await db.person.update(record.id, { source: 'api' })
})

events.on('deal.updated', ({ record, changes }) => {
  if (changes.stage === 'closed_won') {
    console.log(`Deal won: ${record.title}`)
  }
})

events.on('person.deleted', ({ id }) => {
  console.log(`Deleted person ${id}`)
})

const db = relate({ adapter, schema, events })
```

### Event behavior

- `created` handlers receive `{ record, db }`
- `updated` handlers receive `{ record, changes, db }`
- `deleted` handlers receive `{ id, db }`
- Hook errors are isolated and logged
- Recursive hook chains are capped at depth 5
- `upsert()` emits either `created` or `updated` based on what happened

## Errors

```typescript
import { ValidationError } from '@nokto-labs/relate'

try {
  await db.person.create({ name: 'Alice' })
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.detail)
  }
}
```

Error codes:

- `DUPLICATE_RECORD`
- `RECORD_NOT_FOUND`
- `RELATIONSHIP_NOT_FOUND`
- `LIST_NOT_FOUND`
- `VALIDATION_ERROR`
- `INVALID_OPERATION`
- `REF_NOT_FOUND`
- `REF_CONSTRAINT`
- `CASCADE_DEPTH_EXCEEDED`
- `INVALID_SCHEMA`

## Migrations

```typescript
await db.migrate()

await db.applyMigrations([
  {
    id: '001_rename_tier_to_plan',
    async up(db) {
      await renameColumn(db, 'person', 'tier', 'plan')
    },
  },
])
```

`migrate()` creates missing tables and adds missing columns.

`applyMigrations()` is for tracked structural changes such as renames and drops.

## Storage adapters

Relate is adapter-driven. The adapter owns persistence; the core package owns the domain model and runtime guarantees.

| Package | Database | Status |
|---------|----------|--------|
| `@nokto-labs/relate-d1` | Cloudflare D1 | Available |
| `@nokto-labs/relate-pg` | PostgreSQL | Planned |
| `@nokto-labs/relate-turso` | Turso / SQLite | Planned |
