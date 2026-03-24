# `@nokto-labs/relate-hono`

Generate a full Hono API from a Relate schema.

## Links

- Repository: [github.com/nokto-labs/relate](https://github.com/nokto-labs/relate)
- Package source: [packages/relate-hono](https://github.com/nokto-labs/relate/tree/main/packages/relate-hono)
- Issues: [github.com/nokto-labs/relate/issues](https://github.com/nokto-labs/relate/issues)
- Example: [Cloudflare Worker example](https://github.com/nokto-labs/relate/blob/main/examples/cloudflare-worker.md)

## Install

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono hono
```

## Quick Start

```typescript
import { Hono } from 'hono'
import { relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env {
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  db: (c: { env: Env }) => relate({
    adapter: new D1Adapter(c.env.DB),
    schema,
  }),
}))

export default app
```

## What it generates

- record CRUD routes
- nested ref routes
- relationships routes
- activities routes
- lists routes
- optional schema inspection
- optional migration routes

Record, relationship, activity, and list routes are enabled by default. Meta routes (`/schema` and `/migrate`) are opt-in.

## Records

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/:plural` | Create |
| `PUT` | `/:plural` | Upsert |
| `GET` | `/:plural` | List |
| `GET` | `/:plural/:id` | Get by ID |
| `GET` | `/:plural/count` | Count |
| `PATCH` | `/:plural/:id` | Update |
| `DELETE` | `/:plural/:id` | Delete |

### Query params

- `limit`
- `offset`
- `orderBy`
- `order`
- `cursor`
- filter params that map to Relate filter operators

`GET /:plural/count` accepts the same filter params as `GET /:plural`.

## Nested ref routes

For each unambiguous ref field, Relate generates nested child routes automatically.

```typescript
checkin: {
  plural: 'checkins',
  attributes: {
    event: { type: 'ref', object: 'event', required: true },
    guest: { type: 'ref', object: 'guest', required: true },
  },
}
```

That generates:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/events/:eventId/checkins` | List checkins for an event |
| `POST` | `/events/:eventId/checkins` | Create a checkin with `event = eventId` |
| `GET` | `/guests/:guestId/checkins` | List checkins for a guest |
| `POST` | `/guests/:guestId/checkins` | Create a checkin with `guest = guestId` |

Flat routes still work alongside nested routes:

```text
GET /checkins?event=evt_123
```

### Ambiguous parent-child pairs

If a child has multiple refs to the same parent object, the short path would be ambiguous.

Example:

```typescript
message: {
  plural: 'messages',
  attributes: {
    author: { type: 'ref', object: 'user', required: true },
    reviewer: { type: 'ref', object: 'user', required: true },
    text: { type: 'text', required: true },
  },
}
```

Relate generates explicit ref-field routes instead:

| Method | Path |
|--------|------|
| `GET` | `/users/:userId/messages/by/author` |
| `POST` | `/users/:userId/messages/by/author` |
| `GET` | `/users/:userId/messages/by/reviewer` |
| `POST` | `/users/:userId/messages/by/reviewer` |

## Filtering

```text
GET /deals?stage=won
GET /deals?value[gte]=10000&value[lt]=100000
GET /deals?stage[in]=lead,qualified,proposal
GET /people?name[like]=Ali%
```

### Operator reference

| Operator | Query shape | Example |
|----------|-------------|---------|
| equality shorthand | `?field=value` | `?stage=won` |
| `eq` | `?field[eq]=value` | `?stage[eq]=won` |
| `ne` | `?field[ne]=value` | `?stage[ne]=lost` |
| `gt` | `?field[gt]=value` | `?value[gt]=1000` |
| `gte` | `?field[gte]=value` | `?value[gte]=1000` |
| `lt` | `?field[lt]=value` | `?value[lt]=5000` |
| `lte` | `?field[lte]=value` | `?value[lte]=5000` |
| `in` | `?field[in]=a,b,c` | `?stage[in]=lead,won` |
| `like` | `?field[like]=pattern` | `?name[like]=Ali%` |

### Value parsing

| Attribute type | Accepted query values |
|----------------|-----------------------|
| `text`, `email`, `url`, `select`, `ref` | strings |
| `number` | numeric strings like `42` or `10.5` |
| `boolean` | `true`, `false`, `1`, `0` |
| `date` | ISO strings or millisecond timestamps |

### Notes

- `like` is supported for `text`, `email`, `url`, `select`, and `ref`
- `in` values are comma-separated in the query string
- Reserved query params are `limit`, `offset`, `orderBy`, `order`, and `cursor`
- The same filter syntax works on record list routes and record count routes

## Cursor pagination

```text
GET /people?limit=20&cursor=eyJ2Ijo...
```

Responses return:

```json
{
  "records": [],
  "nextCursor": "..."
}
```

## Other route groups

### Relationships

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/relationships` | Create |
| `GET` | `/relationships` | List all |
| `GET` | `/relationships/:plural/:id` | List for a record |
| `PATCH` | `/relationships/:id` | Update |
| `DELETE` | `/relationships/:id` | Delete |

### Activities

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/activities` | Track |
| `GET` | `/activities` | List all |
| `GET` | `/activities/:plural/:id` | List for a record |

### Lists

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/lists` | Create |
| `GET` | `/lists` | List all |
| `GET` | `/lists/:id` | Get |
| `PATCH` | `/lists/:id` | Update |
| `DELETE` | `/lists/:id` | Delete |
| `POST` | `/lists/:id/items` | Add items |
| `DELETE` | `/lists/:id/items` | Remove items |
| `GET` | `/lists/:id/items` | List items |
| `GET` | `/lists/:id/count` | Count items |

`GET /lists/:id/items` supports `filter`, `limit`, `offset`, and `cursor`.

`GET /lists/:id/count` supports filter params too.

### Meta

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/schema` | Return the schema |
| `POST` | `/migrate` | Run migrations |

Meta routes are disabled by default. Enable them explicitly with `routes: { schema: true, migrate: true }`.

## Options

```typescript
relateRoutes({
  schema,
  db: (c) => relate({ ... }),
  prefix: '/api/v1',
  middleware: [auth],
  maxLimit: 100,
  routes: { lists: false, schema: true, migrate: true },
})
```

| Option | Purpose |
|--------|---------|
| `schema` | Your Relate schema |
| `db` | Factory that returns a Relate instance per request |
| `prefix` | Prefix all generated routes |
| `middleware` | Hono middleware to run before routes |
| `maxLimit` | Cap `?limit=` values |
| `routes` | Enable or disable route groups |

## Errors

Relate SDK errors are mapped to HTTP responses automatically.

| Error code | Status |
|------------|--------|
| `DUPLICATE_RECORD` | 409 |
| `RECORD_NOT_FOUND` | 404 |
| `RELATIONSHIP_NOT_FOUND` | 404 |
| `LIST_NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `INVALID_OPERATION` | 400 |
| `REF_NOT_FOUND` | 400 |
| `REF_CONSTRAINT` | 409 |
| `CASCADE_DEPTH_EXCEEDED` | 500 |

## Good to know

- `db` must be a factory function, not a shared Relate instance
- If you want hooks during API requests, create an `EventBus` in your app and pass it into `relate()` inside the `db` factory
- Nested ref routes only exist for ref fields
- Use flat `PATCH` and `DELETE` routes for child records even when nested create/list routes exist

## Companion packages

- Core SDK: [@nokto-labs/relate](https://github.com/nokto-labs/relate/tree/main/packages/relate)
- D1 adapter: [@nokto-labs/relate-d1](https://github.com/nokto-labs/relate/tree/main/packages/relate-d1)
