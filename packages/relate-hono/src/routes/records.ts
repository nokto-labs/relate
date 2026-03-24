import { Hono } from 'hono'
import type { ObjectSchema, SchemaInput } from '@nokto-labs/relate'
import type { HonoEnv, AnyRelate, AnyObjectClient } from '../types'
import { parseFilters } from '../filters'
import { capLimit, parseOffset } from '../limits'

export function recordRoutes(objects: SchemaInput, pluralToSlug: Record<string, string>) {
  const app = new Hono<HonoEnv>()
  const slugToPlural = Object.fromEntries(
    Object.entries(pluralToSlug).map(([plural, slug]) => [slug, plural]),
  )
  const nestedRefPairCounts = new Map<string, number>()

  function resolveResource(db: AnyRelate, plural: string): { client: AnyObjectClient; objectSchema: ObjectSchema } | null {
    const slug = pluralToSlug[plural]
    if (!slug) return null
    const client = (db as unknown as Record<string, AnyObjectClient>)[slug]
    const objectSchema = objects[slug]
    if (!client || !objectSchema) return null
    return { client, objectSchema }
  }

  for (const [childSlug, childSchema] of Object.entries(objects)) {
    const childPlural = slugToPlural[childSlug]
    if (!childPlural) continue

    for (const attrSchema of Object.values(childSchema.attributes)) {
      const raw = attrSchema as unknown as { type: string; object?: string }
      if (typeof attrSchema === 'string' || raw.type !== 'ref' || !raw.object) continue

      const parentPlural = slugToPlural[raw.object]
      if (!parentPlural) continue

      const pairKey = `${parentPlural}:${childPlural}`
      nestedRefPairCounts.set(pairKey, (nestedRefPairCounts.get(pairKey) ?? 0) + 1)
    }
  }

  // ─── Nested routes for ref attributes ──────────────────────────────────────
  // GET  /:parentPlural/:parentId/:childPlural — list child records by ref
  // POST /:parentPlural/:parentId/:childPlural — create child with parent ID injected
  for (const [childSlug, childSchema] of Object.entries(objects)) {
    const childPlural = slugToPlural[childSlug]
    if (!childPlural) continue

    for (const [attrName, attrSchema] of Object.entries(childSchema.attributes)) {
      const raw = attrSchema as unknown as { type: string; object?: string }
      if (typeof attrSchema === 'string' || raw.type !== 'ref' || !raw.object) continue
      const parentSlug = raw.object
      const parentPlural = slugToPlural[parentSlug]
      if (!parentPlural) continue
      const pairKey = `${parentPlural}:${childPlural}`
      const isAmbiguousPair = (nestedRefPairCounts.get(pairKey) ?? 0) > 1
      const nestedPath = isAmbiguousPair
        ? `/${parentPlural}/:parentId/${childPlural}/by/${attrName}`
        : `/${parentPlural}/:parentId/${childPlural}`

      app.get(nestedPath, async (c) => {
        const db = c.get('db')
        const resource = resolveResource(db, childPlural)
        if (!resource) return c.json({ error: `Unknown resource: ${childPlural}` }, 404)

        const parentId = c.req.param('parentId')
        const maxLimit = c.get('maxLimit')
        const limit = capLimit(c.req.query('limit'), maxLimit)
        const orderBy = c.req.query('orderBy')
        const order = c.req.query('order') as 'asc' | 'desc' | undefined
        const cursor = c.req.query('cursor')
        const baseFilter = parseFilters(c.req.queries() ?? {}, resource.objectSchema) ?? {}
        const filter = { ...baseFilter, [attrName]: parentId }

        if (cursor !== undefined) {
          return c.json(await resource.client.findPage({ filter, limit, orderBy, order, cursor: cursor || undefined }))
        }

        const offset = parseOffset(c.req.query('offset'))
        return c.json(await resource.client.find({ filter, limit, offset, orderBy, order }))
      })

      app.post(nestedPath, async (c) => {
        const db = c.get('db')
        const resource = resolveResource(db, childPlural)
        if (!resource) return c.json({ error: `Unknown resource: ${childPlural}` }, 404)

        const parentId = c.req.param('parentId')
        const body = await c.req.json<Record<string, unknown>>()
        return c.json(await resource.client.create({ ...body, [attrName]: parentId }), 201)
      })
    }
  }

  // ─── Flat routes ──────────────────────────────────────────────────────────
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
    const limit = capLimit(c.req.query('limit'), maxLimit)
    const filter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)

    if (cursor !== undefined) {
      return c.json(await resource.client.findPage({ filter, limit, orderBy, order, cursor: cursor || undefined }))
    }

    const offset = parseOffset(c.req.query('offset'))
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
