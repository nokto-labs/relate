# relate

Core SDK. Define your domain in TypeScript. Get typed records, relationships, activity tracking, dynamic lists, and a full REST API.

```bash
npm install @nokto-labs/relate
```

## Schema

```typescript
import { relate, defineSchema } from '@nokto-labs/relate'

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
        size: 'number',
      },
      uniqueBy: 'domain',
    },
    deal: {
      attributes: {
        title: { type: 'text', required: true },
        value: 'number',
        stage: { type: 'select', options: ['lead', 'qualified', 'proposal', 'won', 'lost'] as const },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
    owner: { from: 'person', to: 'deal' },
  },
})
```

Attribute types: `text`, `number`, `boolean`, `date`, `email`, `url`, `select`.

Options per object:
- `plural` — route name (defaults to slug + `s`)
- `uniqueBy` — enables upsert and duplicate checking on create
- `relationships` — optional, documents how objects connect

## Records

```typescript
const db = relate({ adapter, schema })

const alice = await db.person.create({ email: 'alice@acme.com', name: 'Alice', tier: 'vip' })
const acme = await db.company.upsert({ domain: 'acme.com', name: 'Acme Inc', size: 50 })
const person = await db.person.get(alice.id)
await db.person.update(alice.id, { tier: 'regular' })
await db.person.delete(alice.id)
```

Required fields are validated at runtime — missing one returns a structured error with the field name.

Duplicate detection: if `uniqueBy` is set, `create()` rejects duplicates. Use `upsert()` to merge.

## Filtering

```typescript
// Equality
await db.person.find({ filter: { tier: 'vip' } })

// Operators
await db.deal.find({
  filter: {
    value: { gte: 10_000 },
    stage: { in: ['lead', 'qualified'] },
  },
})

await db.person.find({ filter: { name: { like: 'Ali%' } } })

// Count
await db.deal.count({ stage: 'won', value: { gt: 50_000 } })
```

Operators: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `like`.

## Pagination

```typescript
// Cursor-based (recommended)
const page1 = await db.person.findPage({ limit: 20 })
const page2 = await db.person.findPage({ limit: 20, cursor: page1.nextCursor })

// Offset-based
await db.person.find({ limit: 10, offset: 20 })
```

## Relationships

```typescript
await db.relationships.create({
  from: { object: 'person', id: alice.id },
  to: { object: 'company', id: acme.id },
  type: 'works_at',
  attributes: { role: 'CEO' },
})

await db.relationships.list({ object: 'person', id: alice.id })
await db.relationships.list({ object: 'company', id: acme.id }, { type: 'works_at' })
await db.relationships.update(relId, { role: 'CTO' })
await db.relationships.delete(relId)
```

Object names are checked at compile time. Deleting a record automatically cleans up its relationships.

## Activities

```typescript
await db.activities.track({
  record: { object: 'deal', id: deal.id },
  type: 'stage_changed',
  metadata: { from: 'lead', to: 'qualified' },
})

// Backdate
await db.activities.track({
  record: { object: 'person', id: alice.id },
  type: 'email_opened',
  metadata: { subject: 'Welcome' },
  occurredAt: new Date('2025-01-15'),
})

await db.activities.list({ object: 'deal', id: deal.id }, { limit: 50, before: new Date() })
```

## Lists

```typescript
// Static — manually curated
const speakers = await db.lists.create({ name: 'Speakers', object: 'person', type: 'static' })
await db.lists.addTo(speakers.id, [alice.id, bob.id])
await db.lists.removeFrom(speakers.id, [bob.id])
await db.lists.items(speakers.id, { limit: 20, filter: { tier: 'vip' } })

// Dynamic — saved filter, resolves live
const bigDeals = await db.lists.create({
  name: 'Big open deals',
  object: 'deal',
  type: 'dynamic',
  filter: { value: { gte: 50_000 }, stage: { in: ['lead', 'qualified', 'proposal'] } },
})
await db.lists.items(bigDeals.id, { limit: 20 })
await db.lists.count(bigDeals.id)
```

Both types use the same `items()` and `count()` interface. Dynamic list filters are validated against the object's attributes.

## Events

```typescript
import { EventBus } from '@nokto-labs/relate'

const events = new EventBus()

events.on('person.created', async ({ record, db }) => {
  await sendWelcomeEmail(record.email)
  await db.person.update(record.id, { status: 'welcomed' })
})

events.on('deal.updated', ({ record, changes }) => {
  if (changes.stage === 'closed_won') console.log(`Deal won: ${record.title}`)
})

events.on('person.deleted', ({ id }) => {
  console.log(`Person ${id} deleted`)
})

const db = relate({ adapter, schema, events })
```

- Handlers can be sync or async
- Each handler receives `{ record, db }` (created/updated) or `{ id, db }` (deleted)
- Updated events also get `{ changes }` — the fields that were modified
- Error-isolated: a failing hook logs the error but doesn't crash the request
- Recursion capped at depth 5 with a warning
- Upsert emits `created` or `updated` based on what actually happened

## Errors

```typescript
import { NotFoundError, DuplicateError, ValidationError } from '@nokto-labs/relate'

try {
  await db.person.create({ name: 'Alice' }) // missing required email
} catch (err) {
  if (err instanceof ValidationError) {
    console.log(err.detail)
    // { code: 'VALIDATION_ERROR', message: 'Missing required attribute "email" on "person"', object: 'person', field: 'email' }
  }
}
```

Error codes: `DUPLICATE_RECORD`, `RECORD_NOT_FOUND`, `RELATIONSHIP_NOT_FOUND`, `LIST_NOT_FOUND`, `VALIDATION_ERROR`, `INVALID_OPERATION`.

## Migrations

```typescript
await db.migrate() // syncs schema → tables

await db.applyMigrations([
  {
    id: '001_rename_tier_to_plan',
    async up(db) { await renameColumn(db, 'person', 'tier', 'plan') },
  },
])
```

`migrate()` creates tables and adds new columns. `applyMigrations()` runs user-defined migrations exactly once, tracked in `relate_migrations`.

## Storage adapters

Implement `StorageAdapter` to support any database.

| Package | Database | Status |
|---------|----------|--------|
| `@nokto-labs/relate-d1` | Cloudflare D1 | Available |
| `@nokto-labs/relate-pg` | PostgreSQL | Planned |
| `@nokto-labs/relate-turso` | Turso/SQLite | Planned |
