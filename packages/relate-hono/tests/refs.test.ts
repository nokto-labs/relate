import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import { relate, defineSchema } from '@nokto-labs/relate'
import { D1Adapter } from '../../relate-d1/src'
import type { D1Database } from '../../relate-d1/src'
import { relateRoutes } from '../src'

const schema = defineSchema({
  objects: {
    guest: {
      plural: 'guests',
      attributes: {
        name: { type: 'text', required: true },
      },
    },
    event: {
      plural: 'events',
      attributes: {
        title: { type: 'text', required: true },
      },
    },
    checkin: {
      plural: 'checkins',
      attributes: {
        guest: { type: 'ref', object: 'guest', required: true, onDelete: 'cascade' },
        event: { type: 'ref', object: 'event', required: true, onDelete: 'cascade' },
        status: { type: 'select', options: ['invited', 'confirmed'] as const },
      },
    },
  },
})

const multiRefSchema = defineSchema({
  objects: {
    user: {
      plural: 'users',
      attributes: {
        name: { type: 'text', required: true },
      },
    },
    message: {
      plural: 'messages',
      attributes: {
        author: { type: 'ref', object: 'user', required: true, onDelete: 'cascade' },
        reviewer: { type: 'ref', object: 'user', required: true, onDelete: 'cascade' },
        text: { type: 'text', required: true },
      },
    },
  },
})

let mf: Miniflare
let d1: D1Database

async function getDB(): Promise<D1Database> {
  if (!mf) {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'test-db' },
    })
    d1 = await mf.getD1Database('DB') as unknown as D1Database
  }
  return d1
}

const TABLES = [
  'relate_guest', 'relate_event', 'relate_checkin',
  'relate_user', 'relate_message',
  'relate_relationships', 'relate_activities',
  'relate_lists', 'relate_list_items', 'relate_migrations',
]

async function resetDB() {
  const raw = await getDB()
  for (const t of TABLES) {
    await raw.prepare(`DELETE FROM ${t}`).run().catch(() => {})
  }
}

async function createTestApp(activeSchema = schema) {
  const raw = await getDB()
  const adapter = new D1Adapter(raw)
  await adapter.migrate(activeSchema.objects)

  const app = relateRoutes({
    schema: activeSchema,
    db: () => relate({ adapter: new D1Adapter(raw), schema: activeSchema }),
  } as any)

  return { app }
}

function req(app: any, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}

afterAll(async () => { if (mf) await mf.dispose() })

describe('nested ref routes (Hono)', () => {
  beforeAll(async () => { await createTestApp() })
  beforeEach(async () => { await resetDB() })

  it('POST /:parentPlural/:parentId/:childPlural creates with injected ref', async () => {
    const { app } = await createTestApp()

    const guestRes = await req(app, 'POST', '/guests', { name: 'Alice' })
    const guest = await guestRes.json()

    const eventRes = await req(app, 'POST', '/events', { title: 'Conf' })
    const event = await eventRes.json()

    const res = await req(app, 'POST', `/events/${event.id}/checkins`, {
      guest: guest.id,
      status: 'invited',
    })
    expect(res.status).toBe(201)

    const checkin = await res.json()
    expect(checkin.event).toBe(event.id)
    expect(checkin.guest).toBe(guest.id)
    expect(checkin.status).toBe('invited')
  })

  it('GET /:parentPlural/:parentId/:childPlural lists filtered by ref', async () => {
    const { app } = await createTestApp()

    const g1 = await (await req(app, 'POST', '/guests', { name: 'Alice' })).json()
    const g2 = await (await req(app, 'POST', '/guests', { name: 'Bob' })).json()
    const ev = await (await req(app, 'POST', '/events', { title: 'Conf' })).json()

    await req(app, 'POST', '/checkins', { guest: g1.id, event: ev.id, status: 'invited' })
    await req(app, 'POST', '/checkins', { guest: g2.id, event: ev.id, status: 'confirmed' })

    // Get checkins for event
    const res = await req(app, 'GET', `/events/${ev.id}/checkins`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)

    // Get checkins for guest1 only
    const res2 = await req(app, 'GET', `/guests/${g1.id}/checkins`)
    const body2 = await res2.json()
    expect(body2).toHaveLength(1)
    expect(body2[0].guest).toBe(g1.id)
  })

  it('flat routes still work alongside nested routes', async () => {
    const { app } = await createTestApp()

    const guest = await (await req(app, 'POST', '/guests', { name: 'Alice' })).json()
    const event = await (await req(app, 'POST', '/events', { title: 'Conf' })).json()

    await req(app, 'POST', '/checkins', { guest: guest.id, event: event.id, status: 'invited' })

    const res = await req(app, 'GET', `/checkins?guest=${guest.id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(1)
  })

  it('uses explicit ref-field paths when multiple refs point to the same parent object', async () => {
    const { app } = await createTestApp(multiRefSchema)

    const userA = await (await req(app, 'POST', '/users', { name: 'Alice' })).json()
    const userB = await (await req(app, 'POST', '/users', { name: 'Bob' })).json()

    const byAuthor = await req(app, 'POST', `/users/${userA.id}/messages/by/author`, {
      reviewer: userB.id,
      text: 'Draft',
    })
    expect(byAuthor.status).toBe(201)
    const authorMessage = await byAuthor.json()
    expect(authorMessage.author).toBe(userA.id)
    expect(authorMessage.reviewer).toBe(userB.id)

    const byReviewer = await req(app, 'POST', `/users/${userA.id}/messages/by/reviewer`, {
      author: userB.id,
      text: 'Review me',
    })
    expect(byReviewer.status).toBe(201)
    const reviewerMessage = await byReviewer.json()
    expect(reviewerMessage.author).toBe(userB.id)
    expect(reviewerMessage.reviewer).toBe(userA.id)

    const ambiguous = await req(app, 'GET', `/users/${userA.id}/messages`)
    expect(ambiguous.status).toBe(404)

    const authored = await (await req(app, 'GET', `/users/${userA.id}/messages/by/author`)).json()
    expect(authored).toHaveLength(1)
    expect(authored[0].id).toBe(authorMessage.id)

    const reviewed = await (await req(app, 'GET', `/users/${userA.id}/messages/by/reviewer`)).json()
    expect(reviewed).toHaveLength(1)
    expect(reviewed[0].id).toBe(reviewerMessage.id)
  })
})
