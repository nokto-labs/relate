import { Hono } from 'hono'
import type { HonoEnv } from '../types'
import { capLimit } from '../limits'

export function relationshipRoutes(pluralToSlug: Record<string, string>) {
  const app = new Hono<HonoEnv>()

  app.post('/relationships', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<{
      from: { object: string; id: string }
      to: { object: string; id: string }
      type: string
      attributes?: Record<string, unknown>
    }>()
    return c.json(await crm.relationships.create(body), 201)
  })

  app.get('/relationships', async (c) => {
    const crm = c.get('crm')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    return c.json(await crm.relationships.list(undefined, { type, limit }))
  })

  app.get('/relationships/:plural/:id', async (c) => {
    const crm = c.get('crm')
    const slug = pluralToSlug[c.req.param('plural')] ?? c.req.param('plural')
    const type = c.req.query('type')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, c.get('maxLimit'))
    return c.json(await crm.relationships.list({ object: slug, id: c.req.param('id') }, { type, limit }))
  })

  app.patch('/relationships/:id', async (c) => {
    const crm = c.get('crm')
    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await crm.relationships.update(c.req.param('id'), body))
  })

  app.delete('/relationships/:id', async (c) => {
    const crm = c.get('crm')
    await crm.relationships.delete(c.req.param('id'))
    return c.body(null, 204)
  })

  return app
}
