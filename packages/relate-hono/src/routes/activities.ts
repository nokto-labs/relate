import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { capLimit, parseDateQuery, parseOffset } from '../limits'

export function activityRoutes(pluralToSlug: Record<string, string>) {
  const app = new Hono<HonoEnv>()

  app.post('/activities', async (c) => {
    const db = c.get('db')
    const body = await c.req.json<{
      record: { object: string; id: string }
      type: string
      metadata?: Record<string, unknown>
      occurredAt?: string
    }>()
    return c.json(await db.activities.track({
      ...body,
      occurredAt: parseDateQuery(body.occurredAt, 'occurredAt'),
    }), 201)
  })

  app.get('/activities', async (c) => {
    const db = c.get('db')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit'), c.get('maxLimit'))
    const offset = parseOffset(c.req.query('offset'))
    const before = parseDateQuery(c.req.query('before'), 'before')
    return c.json(await db.activities.list(undefined, { type, limit, offset, before }))
  })

  app.get('/activities/:plural/:id', async (c) => {
    const db = c.get('db')
    const slug = pluralToSlug[c.req.param('plural')] ?? c.req.param('plural')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit'), c.get('maxLimit'))
    const offset = parseOffset(c.req.query('offset'))
    const before = parseDateQuery(c.req.query('before'), 'before')
    return c.json(await db.activities.list({ object: slug, id: c.req.param('id') }, { type, limit, offset, before }))
  })

  return app
}
