import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { capLimit } from '../limits'

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
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
    }), 201)
  })

  app.get('/activities', async (c) => {
    const db = c.get('db')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
    const before = c.req.query('before') ? new Date(c.req.query('before')!) : undefined
    return c.json(await db.activities.list(undefined, { type, limit, offset, before }))
  })

  app.get('/activities/:plural/:id', async (c) => {
    const db = c.get('db')
    const slug = pluralToSlug[c.req.param('plural')] ?? c.req.param('plural')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
    const before = c.req.query('before') ? new Date(c.req.query('before')!) : undefined
    return c.json(await db.activities.list({ object: slug, id: c.req.param('id') }, { type, limit, offset, before }))
  })

  return app
}
