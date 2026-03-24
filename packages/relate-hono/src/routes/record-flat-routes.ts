import { Hono } from 'hono'
import type { SchemaInput } from '@nokto-labs/relate'
import type { HonoEnv } from '../types'
import { parseFilters } from '../filters'
import { capLimit, parseOffset } from '../limits'
import {
  matchesRecordFilter,
  mergeRecordFilters,
  resolveRecordResource,
  type RecordRoutePolicyMap,
} from './record-route-utils'

export function registerFlatRecordRoutes(
  app: Hono<HonoEnv>,
  objects: SchemaInput,
  pluralToSlug: Record<string, string>,
  policies?: RecordRoutePolicyMap,
): void {
  async function getScopedRecord(
    c: any,
    operation: 'get' | 'update' | 'delete',
  ): Promise<{ resource: NonNullable<ReturnType<typeof resolveRecordResource>>; record: Record<string, unknown> } | Response> {
    const db = c.get('db')
    const resource = resolveRecordResource(db, objects, pluralToSlug, c.req.param('plural'), operation, policies)
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const record = await resource.client.get(c.req.param('id'))
    if (!record) return c.json({ error: 'Not found' }, 404)
    if (resource.filter && !matchesRecordFilter(record as Record<string, unknown>, resource.filter)) {
      return c.json({ error: 'Not found' }, 404)
    }

    return { resource, record: record as Record<string, unknown> }
  }

  app.post('/:plural', async (c) => {
    const db = c.get('db')
    const resource = resolveRecordResource(db, objects, pluralToSlug, c.req.param('plural'), 'create', policies)
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await resource.client.create(body), 201)
  })

  app.put('/:plural', async (c) => {
    const db = c.get('db')
    const resource = resolveRecordResource(db, objects, pluralToSlug, c.req.param('plural'), 'upsert', policies)
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await resource.client.upsert(body))
  })

  app.get('/:plural/count', async (c) => {
    const db = c.get('db')
    const resource = resolveRecordResource(db, objects, pluralToSlug, c.req.param('plural'), 'count', policies)
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const queryFilter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)
    const filter = mergeRecordFilters(queryFilter ?? undefined, resource.filter)
    return c.json({ count: await resource.client.count(filter) })
  })

  app.get('/:plural/:id', async (c) => {
    const scoped = await getScopedRecord(c, 'get')
    if (scoped instanceof Response) return scoped
    return c.json(scoped.record)
  })

  app.get('/:plural', async (c) => {
    const db = c.get('db')
    const resource = resolveRecordResource(db, objects, pluralToSlug, c.req.param('plural'), 'list', policies)
    if (!resource) return c.json({ error: `Unknown resource: ${c.req.param('plural')}` }, 404)

    const orderBy = c.req.query('orderBy')
    const order = c.req.query('order') as 'asc' | 'desc' | undefined
    const cursor = c.req.query('cursor')
    const maxLimit = c.get('maxLimit')
    const limit = capLimit(c.req.query('limit'), maxLimit)
    const queryFilter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)
    const filter = mergeRecordFilters(queryFilter ?? undefined, resource.filter)

    if (cursor !== undefined) {
      return c.json(await resource.client.findPage({ filter, limit, orderBy, order, cursor: cursor || undefined }))
    }

    const offset = parseOffset(c.req.query('offset'))
    return c.json(await resource.client.find({ filter, limit, offset, orderBy, order }))
  })

  app.patch('/:plural/:id', async (c) => {
    const scoped = await getScopedRecord(c, 'update')
    if (scoped instanceof Response) return scoped

    const body = await c.req.json<Record<string, unknown>>()
    return c.json(await scoped.resource.client.update(c.req.param('id'), body))
  })

  app.delete('/:plural/:id', async (c) => {
    const scoped = await getScopedRecord(c, 'delete')
    if (scoped instanceof Response) return scoped

    await scoped.resource.client.delete(c.req.param('id'))
    return c.body(null, 204)
  })
}
