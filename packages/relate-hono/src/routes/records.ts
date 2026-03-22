import { Hono } from 'hono'
import type { ObjectSchema, SchemaInput } from '@nokto-labs/relate'
import type { HonoEnv, AnyRelate, AnyObjectClient } from '../types'
import { parseFilters } from '../filters'
import { capLimit } from '../limits'

export function recordRoutes(objects: SchemaInput, pluralToSlug: Record<string, string>) {
  const app = new Hono<HonoEnv>()

  function resolveResource(db: AnyRelate, plural: string): { client: AnyObjectClient; objectSchema: ObjectSchema } | null {
    const slug = pluralToSlug[plural]
    if (!slug) return null
    const client = (db as unknown as Record<string, AnyObjectClient>)[slug]
    const objectSchema = objects[slug]
    if (!client || !objectSchema) return null
    return { client, objectSchema }
  }

  app.post('/:plural', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await resource.client.create(body), 201)
  })

  app.put('/:plural', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await resource.client.upsert(body))
  })

  app.get('/:plural/count', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const filter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)
    return c.json({ count: await resource.client.count(filter) })
  })

  app.get('/:plural/:id', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const record = await resource.client.get(c.req.param('id'))
    if (!record) return c.json({ error: 'Not found' }, 404)
    return c.json(record)
  })

  app.get('/:plural', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const orderBy = c.req.query('orderBy')
    const order = c.req.query('order') as 'asc' | 'desc' | undefined
    const cursor = c.req.query('cursor')
    const maxLimit = c.get('maxLimit')
    const limit = capLimit(c.req.query('limit') ? Number(c.req.query('limit')) : undefined, maxLimit)
    const filter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)

    if (cursor !== undefined) {
      return c.json(await resource.client.findPage({ filter, limit, orderBy, order, cursor: cursor || undefined }))
    }

    const offset = c.req.query('offset') ? Number(c.req.query('offset')) : undefined
    return c.json(await resource.client.find({ filter, limit, offset, orderBy, order }))
  })

  app.patch('/:plural/:id', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await resource.client.update(c.req.param('id'), body))
  })

  app.delete('/:plural/:id', async (c) => {
    const db =c.get('db')
    const resource = resolveResource(db, c.req.param('plural'))
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    await resource.client.delete(c.req.param('id'))
    return c.body(null, 204)
  })

  return app
}
