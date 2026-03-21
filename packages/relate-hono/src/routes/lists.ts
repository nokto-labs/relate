import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { capLimit } from '../limits'

export function listRoutes() {
  const app = new Hono<HonoEnv>()

  app.post('/lists', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<{
      name: string
      object: string
      type: 'static' | 'dynamic'
      filter?: Record<string, unknown>
    }>()
    return c.json(await crm.lists.create(body), 201)
  })

  app.get('/lists', async (c) => {
    const crm = c.get('crm')
    const object = c.req.query('object')
    const type = c.req.query('type') as 'static' | 'dynamic' | undefined
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
    return c.json(await crm.lists.list({ object, type, limit, offset }))
  })

  app.get('/lists/:id', async (c) => {
    const crm = c.get('crm')
    const list = await crm.lists.get(c.req.param('id'))
    if (!list) return c.json({ error: 'Not found' }, 404)
    return c.json(list)
  })

  app.patch('/lists/:id', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<{ name?: string; filter?: Record<string, unknown> }>()
    return c.json(await crm.lists.update(c.req.param('id'), body))
  })

  app.delete('/lists/:id', async (c) => {
    const crm = c.get('crm')
    await crm.lists.delete(c.req.param('id'))
    return c.body(null, 204)
  })

  app.post('/lists/:id/items', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<{ recordIds: string[] }>()
    await crm.lists.addTo(c.req.param('id'), body.recordIds)
    return c.json({ ok: true })
  })

  app.delete('/lists/:id/items', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<{ recordIds: string[] }>()
    await crm.lists.removeFrom(c.req.param('id'), body.recordIds)
    return c.body(null, 204)
  })

  app.get('/lists/:id/items', async (c) => {
    const crm = c.get('crm')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    const cursor = c.req.query('cursor') || undefined
    return c.json(await crm.lists.items(c.req.param('id'), { limit, cursor }))
  })

  app.get('/lists/:id/count', async (c) => {
    const crm = c.get('crm')
    return c.json({ count: await crm.lists.count(c.req.param('id')) })
  })

  return app
}
