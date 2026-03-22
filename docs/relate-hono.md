# relate-hono

Hono REST API routes for Relate. One function gives you a full REST API.

```bash
npm install @nokto-labs/relate @nokto-labs/relate-d1 @nokto-labs/relate-hono
```

## Quick start

```typescript
import { Hono } from 'hono'
import { relate } from '@nokto-labs/relate'
import { D1Adapter } from '@nokto-labs/relate-d1'
import { relateRoutes } from '@nokto-labs/relate-hono'
import { schema } from './schema'

interface Env { DB: D1Database }

const app = new Hono<{ Bindings: Env }>()

app.route('/', relateRoutes({
  schema,
  db: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
}))

export default app
```

## Endpoints

### Records (`/:plural`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/:plural` | Create record |
| `PUT` | `/:plural` | Upsert record |
| `GET` | `/:plural` | List records |
| `GET` | `/:plural/:id` | Get record |
| `GET` | `/:plural/count` | Count records |
| `PATCH` | `/:plural/:id` | Update record |
| `DELETE` | `/:plural/:id` | Delete record |

Query params for list: `limit`, `offset`, `orderBy`, `order`, `cursor`, plus filter params.

### Nested ref routes

For each unambiguous `ref` attribute, nested routes are automatically generated:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:parentPlural/:parentId/:childPlural` | List child records filtered by ref |
| `POST` | `/:parentPlural/:parentId/:childPlural` | Create child with parent ID injected |

Example: if `checkin` has `event: { type: 'ref', object: 'event' }`:

```
GET  /events/:eventId/checkins         → list checkins for event
POST /events/:eventId/checkins         → create checkin with event = eventId
```

Flat routes still work alongside nested routes (`GET /checkins?event=id`). No nested `PUT`/`DELETE` — use flat `/checkins/:id` for those.

If a child object has multiple refs to the same parent object, the short path would be ambiguous. In that case, Relate generates explicit ref-field paths instead:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/:parentPlural/:parentId/:childPlural/by/<refField>` | List child records filtered by a specific ref field |
| `POST` | `/:parentPlural/:parentId/:childPlural/by/<refField>` | Create child with a specific ref field injected |

Example: if `message` has both `author` and `reviewer` refs to `user`:

```
GET  /users/:userId/messages/by/author
POST /users/:userId/messages/by/reviewer
```

### Filtering

```
GET /deals?stage=won
GET /deals?value[gte]=10000&value[lt]=100000
GET /deals?stage[in]=lead,qualified,proposal
GET /people?name[like]=Ali%
```

### Cursor pagination

```
GET /people?limit=20&cursor=eyJ2Ijo...
```

Returns `{ records: [...], nextCursor: "..." }`.

### Relationships

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/relationships` | Create relationship |
| `GET` | `/relationships` | List all |
| `GET` | `/relationships/:plural/:id` | List for record |
| `PATCH` | `/relationships/:id` | Update |
| `DELETE` | `/relationships/:id` | Delete |

### Activities

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/activities` | Track activity |
| `GET` | `/activities` | List all |
| `GET` | `/activities/:plural/:id` | List for record |

### Lists

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/lists` | Create list |
| `GET` | `/lists` | List all |
| `GET` | `/lists/:id` | Get list |
| `PATCH` | `/lists/:id` | Update list |
| `DELETE` | `/lists/:id` | Delete list |
| `POST` | `/lists/:id/items` | Add items |
| `DELETE` | `/lists/:id/items` | Remove items |
| `GET` | `/lists/:id/items` | Get items |
| `GET` | `/lists/:id/count` | Count items |

### Other

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/migrate` | Run migrations |
| `GET` | `/schema` | Get schema definition |

## Options

```typescript
app.route('/', relateRoutes({
  // Required
  schema,
  db: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema }),

  // Optional
  events,                          // shared EventBus for hooks
  prefix: '/api/v1',               // prefix all routes
  middleware: [auth, rateLimit],   // run before every route
  maxLimit: 100,                   // cap ?limit= to prevent table dumps
  routes: {                        // toggle route groups
    schema: true,
    migrate: true,
    records: true,
    relationships: true,
    activities: true,
    lists: true,
  },
}))
```

## Middleware

Add auth, rate limiting, or any Hono middleware:

```typescript
const auth: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization')
  if (!token) return c.json({ error: 'Unauthorized' }, 401)
  await next()
}

app.route('/', relateRoutes({
  schema,
  db: (c: { env: Env }) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
  middleware: auth,
}))
```

## Prefix

```typescript
// All routes under /api/v1
app.route('/', relateRoutes({ schema, db, prefix: '/api/v1' }))
// → POST /api/v1/people, GET /api/v1/relationships, etc.
```

## Disable routes

```typescript
// No list or activity endpoints
app.route('/', relateRoutes({ schema, db, routes: { lists: false, activities: false } }))
```

## Errors

All SDK errors are automatically mapped to HTTP status codes:

| Error | Status |
|-------|--------|
| `DUPLICATE_RECORD` | 409 |
| `RECORD_NOT_FOUND` | 404 |
| `RELATIONSHIP_NOT_FOUND` | 404 |
| `LIST_NOT_FOUND` | 404 |
| `VALIDATION_ERROR` | 400 |
| `INVALID_OPERATION` | 400 |
| `REF_NOT_FOUND` | 400 |
| `REF_CONSTRAINT` | 409 |
| `CASCADE_DEPTH_EXCEEDED` | 500 |

Response format:

```json
{
  "error": {
    "code": "DUPLICATE_RECORD",
    "message": "A record with email = \"alice@acme.com\" already exists",
    "object": "person",
    "field": "email",
    "value": "alice@acme.com"
  }
}
```
