import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { capLimit } from '../limits'

export function listRoutes() {
  const app = new Hono<HonoEnv>()

  app.post('/lists', async (c) => {
    const db = c.get('db')
    const body = await c.req.json<{
      name: string
      object: string
      type: 'static' | 'dynamic'
      filter?: Record<string, unknown>
    }>()
    return c.json(await db.lists.create(body), 201)
  })

  app.get('/lists', async (c) => {
    const db = c.get('db')
    const object = c.req.query('object')
    const type = c.req.query('type') as 'static' | 'dynamic' | undefined
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
    return c.json(await db.lists.list({ object, type, limit, offset }))
  })

  app.get('/lists/:id', async (c) => {
    const db = c.get('db')
    const list = await db.lists.get(c.req.param('id'))
    if (!list) return c.json({ error: 'Not found' }, 404)
    return c.json(list)
  })

  app.patch('/lists/:id', async (c) => {
    const db = c.get('db')
    const body = await c.req.json<{ name?: string; filter?: Record<string, unknown> }>()
    return c.json(await db.lists.update(c.req.param('id'), body))
  })

  app.delete('/lists/:id', async (c) => {
    const db = c.get('db')
    await db.lists.delete(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/lists/:id/items', async (c) => {
    const db = c.get('db')
    const body = await c.req.json<{ recordIds: string[] }>()
    await db.lists.addTo(c.req.param('id'), body.recordIds)
    return c.json({ ok: true })
  })

  app.delete('/lists/:id/items', async (c) => {
    const db = c.get('db')
    const body = await c.req.json<{ recordIds: string[] }>()
    await db.lists.removeFrom(c.req.param('id'), body.recordIds)
    return c.body(null, 204)
  })

  app.get('/lists/:id/items', async (c) => {
    const db = c.get('db')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const cursor = c.req.query('cursor') || undefined
    return c.json(await db.lists.items(c.req.param('id'), { limit, cursor }))
  })

  app.get('/lists/:id/count', async (c) => {
    const db = c.get('db')
    return c.json({ count: await db.lists.count(c.req.param('id')) })
  })

  return app
}
