# Recommended Near-Term Extensions

This note narrows earlier feedback into the improvements that seem broadly useful for Relate right now. The focus is neutral APIs, clear package boundaries, and features that solve common problems without introducing domain-specific assumptions.

## What To Build

1. Transactions
2. Scoped route generation
3. Aggregate queries

## Why These Three

- Transactions add a missing correctness primitive for any read-then-write flow
- Scoped route generation removes repetitive Hono route splitting for public and admin APIs
- Aggregate queries avoid loading large result sets into JavaScript just to count or sum

Together they improve correctness, ergonomics, and efficiency without overfitting to one application type.

## Proposal 1: Transactions

### Problem

Relate currently has no public transaction boundary for multi-step application logic. That makes stock checks, capacity limits, sequence allocation, and similar flows race under concurrent requests.

### Direction

Add `db.transaction()` as a core Relate API, with adapter-specific support underneath.

```ts
await db.transaction(async (tx) => {
  const reserved = await tx.assignment.count({
    resource: resourceId,
    state: { in: ['reserved', 'active'] },
  })

  if (reserved >= capacity) {
    throw new Error('Capacity reached')
  }

  await tx.assignment.create({
    resource: resourceId,
    state: 'reserved',
  })
})
```

### Notes

- This should live in `@nokto-labs/relate`
- Adapters can opt in based on backend capabilities
- The current adapter seam for atomic record-mutation batches suggests a natural implementation path
- The public contract should be the transaction callback and rollback behavior, not storage-specific details
- v1 should expose record clients only inside `tx`
- Start with `tx.{object}.get()`, `find()`, `count()`, `create()`, `update()`, and `delete()`
- Relationships, activities, and lists can stay out of scope until a real transactional use case appears

## Proposal 2: Scoped Route Generation

### Problem

`relateRoutes()` currently applies one middleware chain and one prefix to the whole generated API. Applications that need a public read-only surface plus a protected admin surface have to split routes manually.

### Direction

Add route scopes to `relateRoutes()`. Use a new key such as `scopes`, not `routes`, because `routes` already controls route-group toggles.

```ts
relateRoutes({
  schema,
  db,
  scopes: {
    public: {
      prefix: '/api',
      objects: {
        records: {
          operations: ['list', 'get'],
          filter: { published: true },
        },
        tags: {
          operations: ['list'],
        },
      },
    },
    admin: {
      prefix: '/api/admin',
      middleware: [requireAdminAuth],
      objects: 'all',
    },
  },
})
```

### Notes

- Authorization should remain a routing concern, not a schema concern
- Middleware should stay generic rather than embedding bearer-token logic into `@nokto-labs/relate-hono`
- Per-scope default filters are useful for public visibility rules
- The existing top-level `prefix` and `middleware` can remain as the simple one-surface case
- v1 scopes should apply to record routes only
- Other generated route groups can keep their existing all-or-nothing toggles for now

## Proposal 3: Aggregate Queries

### Problem

Applications currently need to fetch records into memory to produce grouped counts and sums.

### Direction

Add a small aggregate API to object clients and let adapters push the query down when they can.

```ts
const totals = await db.entry.aggregate({
  filter: { collection: collectionId },
  count: true,
  groupBy: 'status',
})
// { draft: 12, published: 48, archived: 3 }

const amount = await db.entry.aggregate({
  filter: { collection: collectionId, status: 'published' },
  sum: { field: 'valueCents' },
})
// { sum: 240000 }
```

### Notes

- Start with `count`, `sum`, and `groupBy`
- Keep the first version limited to direct scalar fields
- Avoid dotted field paths in v1
- Core should define the API shape, while adapters decide how much can run in storage
- Native aggregate execution should be adapter-optional
- If an adapter does not implement native aggregates, Relate should fall back to a JavaScript implementation and emit a clear `console.warn`
- The fallback should be intentionally loud so teams notice when a stats endpoint is loading full record sets into memory

## Explicitly Out Of Scope For Now

### Schema-Level Validation Hooks

Useful, but only after transactions exist. Without transactional execution, stateful hooks just relocate race conditions.

### Built-In Auth Sugar

Maybe useful later, but scoped routes are the stronger primitive. If auth sugar is added eventually, it should compile down to scopes plus ordinary middleware.

### TTL / Auto-Expiry

Useful for some applications, but narrower in scope and more invasive because it changes default read semantics across `get()`, `find()`, counts, and aggregates.

## Suggested Delivery Order

1. Transactions
2. Scoped route generation
3. Aggregate queries

## Open Questions

- How should aggregate warnings be phrased so they are visible in development without becoming noisy in legitimate low-volume uses?
- Should aggregate fallbacks expose any opt-out flag for teams that prefer failure over degraded performance?

## Summary

If we only pick a few improvements from the feedback, the best shortlist is:

- `db.transaction()` for correctness
- `relateRoutes({ scopes: ... })` for public/admin ergonomics
- `object.aggregate()` for efficient reporting

The rest can wait until these foundations are in place.
