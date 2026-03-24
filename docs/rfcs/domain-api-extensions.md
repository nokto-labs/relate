# Next D1-First Extensions

This note captures the next Relate extensions worth pursuing after the recent D1-first cleanup.

Current baseline:

- `relateRoutes({ scopes: ... })` is shipped for record-route scoping
- `object.aggregate()` is shipped for direct-field `count`, `sum`, and `groupBy`
- general callback `db.transaction()` is intentionally out of scope because Cloudflare D1 does not expose a safe interactive read-then-write transaction API through the Workers binding

The goal here is to extend Relate using primitives that D1 can actually support today.

## What To Build Next

1. Ref-aware aggregate sums
2. `groupBy + sum` in one aggregate call
3. `db.batch()` for atomic write batches

## Why These Three

- Reporting workloads still fetch rows into JavaScript for common D1-friendly joins such as summing a referenced price amount
- `groupBy + sum` eliminates the most common multi-query reporting pattern without introducing a new reporting DSL
- D1 already supports atomic `batch()` execution for pre-built statements, so Relate should expose that capability directly instead of pretending it has interactive transactions

Together these features stay honest about D1, reduce application boilerplate, and improve performance in the places users are already hitting limits.

## Non-Goals

### General Callback Transactions

Still out of scope. D1 can atomically execute a prepared batch of statements, but it cannot hold an open transaction while Relate code does reads, branches, and then writes.

### Stateful Schema Validation Hooks

Still out of scope. Hooks like `beforeCreate(input, db)` look attractive, but without a D1-compatible conditional write primitive they just relocate race conditions from route handlers into the schema layer.

### Built-In Idempotent Callback API

Also out of scope for now. A helper like `db.idempotent(eventId, fn)` implies stronger execution guarantees than Relate can honestly provide on D1 across retries, crashes, and partial failures.

## Proposal 1: Aggregate v2

### Problem

`aggregate()` currently supports only direct numeric sums. That covers simple totals, but it still forces applications to fetch source rows and manually join referenced records in JavaScript for common reporting tasks such as revenue totals.

Today:

```ts
const tickets = await db.ticket.find({
  filter: { event: eventId, paymentStatus: 'confirmed' },
})

let revenueCents = 0
for (const ticket of tickets) {
  revenueCents += priceMap.get(ticket.price)?.amountCents ?? 0
}
```

That work is a natural SQL join and sum on D1.

### Direction

Extend `aggregate()` in two ways:

1. allow `sum.field` to traverse exactly one ref hop
2. allow `groupBy` and `sum` in the same call

Example:

```ts
const revenue = await db.ticket.aggregate({
  filter: { event: eventId, paymentStatus: 'confirmed' },
  sum: { field: 'price.amountCents' },
})
// { sum: 240000 }

const revenueByPrice = await db.ticket.aggregate({
  filter: { event: eventId, paymentStatus: 'confirmed' },
  groupBy: 'price',
  count: true,
  sum: { field: 'price.amountCents' },
})
// {
//   groups: {
//     price_basic: 120,
//     price_vip: 20,
//   },
//   groupSums: {
//     price_basic: 240000,
//     price_vip: 180000,
//   },
// }
```

### Proposed API Shape

Keep the current input shape and extend it rather than introducing a second reporting API.

```ts
type AggregateRecordsOptions = {
  filter?: Record<string, unknown>
  count?: boolean
  groupBy?: string
  sum?: { field: string }
}

type AggregateRecordsResult = {
  count?: number
  sum?: number
  groups?: Record<string, number>
  groupSums?: Record<string, number>
}
```

Notes:

- `groups` remains the grouped count output for backward compatibility
- `groupSums` is additive and only appears when `groupBy` and `sum` are both used
- ungrouped calls keep returning `count` and/or `sum`

### Validation Rules

v2 should stay tight:

- direct numeric sums like `sum: { field: 'value' }` still work
- ref-aware sums may use exactly one hop, for example `price.amountCents`
- the left side of a dotted sum must be a `ref` attribute on the source object
- the right side must be a direct numeric attribute on the referenced object
- nested paths like `price.product.amountCents` are out of scope
- `groupBy` stays limited to direct attributes in v2, including direct refs such as `price`

That means `groupBy: 'price'` is allowed, but `groupBy: 'price.name'` is not.

### Adapter Behavior

The D1 adapter should implement the full v2 shape.

For adapters without native aggregate support:

- direct-field aggregates may continue to use the existing JavaScript fallback
- ref-aware sums should not silently fall back to an N+1 join in JavaScript
- if an adapter does not support ref-aware aggregates natively, Relate should throw a clear `INVALID_OPERATION` style error

This keeps the D1-first behavior fast without pretending every adapter can support the same join semantics efficiently.

### D1 SQL Shape

For:

```ts
await db.ticket.aggregate({
  filter: { event: eventId, paymentStatus: 'confirmed' },
  sum: { field: 'price.amountCents' },
})
```

Relate should generate the equivalent of:

```sql
SELECT COALESCE(SUM(sum_ref_price.amountCents), 0) AS sum
FROM relate_ticket base
LEFT JOIN relate_price sum_ref_price ON base.price = sum_ref_price.id
WHERE base.event = ? AND base.paymentStatus = ?
```

For grouped sums:

```sql
SELECT
  base.price AS group_value,
  COUNT(*) AS group_count,
  COALESCE(SUM(sum_ref_price.amountCents), 0) AS group_sum
FROM relate_ticket base
LEFT JOIN relate_price sum_ref_price ON base.price = sum_ref_price.id
WHERE base.event = ? AND base.paymentStatus = ?
GROUP BY base.price
```

### Implementation Sketch

- keep core aggregate validation in `packages/relate/src/modules/object-client-aggregate.ts`
- extend validation to parse direct versus dotted sum fields
- add `groupSums` to `AggregateRecordsResult` in `packages/relate/src/adapter.ts`
- keep the existing JavaScript fallback for direct-field aggregates only
- extend the D1 implementation in `packages/relate-d1/src/records/aggregate.ts` to compile one optional join for `sum.field`

## Proposal 2: `db.batch()`

### Problem

Relate no longer exposes a fake general transaction API, but users still need an atomic way to commit a set of record writes together on D1.

The common case is not read-then-write business logic. It is simply:

- create several related records together
- update a few records together
- queue a small write set and either commit all of it or none of it

D1 can do that today with `batch()`.

### Direction

Add a D1-compatible `db.batch()` primitive for atomic write batching.

Example:

```ts
const result = await db.batch((b) => {
  const order = b.order.create({
    customer: customerId,
    status: 'draft',
  })

  b.lineItem.create({
    order: order.id,
    sku: 'sku_123',
    quantity: 2,
  })

  b.lineItem.create({
    order: order.id,
    sku: 'sku_456',
    quantity: 1,
  })

  return { orderId: order.id }
})
```

### Design Constraints

This should be a write builder, not a mini transaction runtime.

- the callback should be synchronous
- no `await`
- no `get`, `find`, `count`, or other reads inside the builder
- no branching on database state
- hooks should emit only after the batch commits successfully

That matches what D1 can actually execute atomically.

### v1 Surface

Keep the first version intentionally small:

- `create`
- `update`

Why not more in v1:

- `delete` in Relate is not just "more complex" than other writes. It is inherently a read-then-write operation because Relate must first inspect incoming refs to plan `cascade` and `set_null` mutations before it can commit the final mutation set.
- that planning phase does not belong inside a synchronous batch builder, which is intentionally limited to queueing writes
- if batched deletes are added later, they should likely use a separate pre-planned mutation path rather than trying to make `b.<object>.delete()` perform hidden reads inside the builder
- `upsert` can probably be supported later, but it wants a D1-native conflict strategy instead of reusing the current read-first object client implementation

### Create Handles

`create()` inside the batch should return a lightweight handle immediately, with a pre-generated `id`.

That handle exists so later writes in the same batch can reference newly created records:

```ts
await db.batch((b) => {
  const contact = b.contact.create({ email: 'alice@example.com' })
  b.ticket.create({ contact: contact.id, event: eventId })
})
```

Relate already generates record IDs client-side for normal creates, so this fits the current model.

### Mapping To Existing Seams

Relate already has an adapter seam for atomic record mutations:

- `RecordMutation`
- `commitRecordMutations()`

That seam already supports:

- `update`
- `delete`
- `cleanup`

`db.batch()` should build on that rather than introducing a second atomic-write channel.

Concretely:

- add a `create` mutation type to `RecordMutation`
- let core collect the planned writes from the batch builder
- let the adapter commit them in one atomic write batch
- reuse the existing “emit hooks after commit” pattern

### D1 Implementation Shape

The D1 adapter should lower each planned write into a prepared statement and execute them together with `db.batch()`.

That means:

- `create` becomes an `INSERT`
- `update` becomes an `UPDATE`
- timestamps are assigned during planning, before commit
- created records and updated records can be reconstructed for hook payloads without doing post-commit reads

### Validation Notes

The goal of `db.batch()` is atomicity of the write set, not a promise that every pre-write validation is now magically transactional.

That means:

- ordinary attribute validation should still run before statements are queued
- ref existence checks cannot run inline during `b.<object>.create()` because the builder is synchronous and cannot query D1
- instead, ref existence checks should happen in a pre-commit validation phase after the batch builder returns but before the adapter executes the final D1 `batch()`
- that pre-commit phase validates the planned writes, then the adapter executes the final atomic write batch
- `db.batch()` helps with “all these writes happen together”
- it does not solve stock checks, counters, sequence allocation, or other read-then-write races

Those still require raw conditional SQL on D1 until Cloudflare exposes a stronger primitive.

## Webhook Idempotency: Recipe, Not Core API

Webhook dedup is a real need, but the right near-term answer is a documented pattern, not a magical callback helper.

Recommended pattern:

```ts
const schema = defineSchema({
  objects: {
    webhookEvent: {
      attributes: {
        provider: { type: 'text', required: true },
        providerEventId: { type: 'text', required: true },
        processedAt: 'date',
      },
      uniqueBy: 'providerEventId',
    },
  },
})
```

Then:

- claim the event with `create()` or `upsert()`
- treat duplicate unique-key errors as “already seen”
- store processing status explicitly in the record

This is honest, portable, and easy to document today.

## Schema Hooks: Still Not The Right Primitive

Stateful hooks such as:

```ts
validate: {
  async beforeCreate(input, db) {
    const sold = await db.ticket.count(...)
    if (sold >= stock) throw new Error('Sold out')
  }
}
```

are still the wrong abstraction for D1-first Relate.

Why:

- the check is still a read
- the insert is still a later write
- without a D1-compatible conditional write primitive, the race still exists

So schema business-rule hooks should stay out of scope until Relate has a genuinely safe primitive to build them on.

## Suggested Delivery Order

1. Aggregate v2: ref-aware sums and `groupBy + sum`
2. `db.batch()` for atomic write batches
3. docs recipe for webhook idempotency

## Summary

The best next D1-first additions are:

- one-hop ref-aware aggregate sums such as `price.amountCents`
- grouped sums via `groupBy + sum`
- a real `db.batch()` primitive that maps directly to D1 `batch()`

The things to avoid right now are the ones that imply stronger guarantees than D1 can provide:

- callback transactions
- stateful schema hooks
- magical idempotent callback wrappers
