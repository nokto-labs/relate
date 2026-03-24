import { Hono } from 'hono'
import type { SchemaInput } from '@nokto-labs/relate'
import type { HonoEnv } from '../types'
import { parseFilters } from '../filters'
import { capLimit, parseOffset } from '../limits'
import { mergeRecordFilters, resolveRecordResource, type RecordRoutePolicyMap } from './record-route-utils'

function buildNestedRefPairCounts(
  objects: SchemaInput,
  slugToPlural: Record<string, string>,
): Map<string, number> {
  const nestedRefPairCounts = new Map<string, number>()

  for (const [childSlug, childSchema] of Object.entries(objects)) {
    const childPlural = slugToPlural[childSlug]
    if (!childPlural) continue

    for (const attrSchema of Object.values(childSchema.attributes)) {
      const raw = attrSchema as { type?: string; object?: string }
      if (typeof attrSchema === 'string' || raw.type !== 'ref' || !raw.object) continue

      const parentPlural = slugToPlural[raw.object]
      if (!parentPlural) continue

      const pairKey = `${parentPlural}:${childPlural}`
      nestedRefPairCounts.set(pairKey, (nestedRefPairCounts.get(pairKey) ?? 0) + 1)
    }
  }

  return nestedRefPairCounts
}

export function registerNestedRecordRoutes(
  app: Hono<HonoEnv>,
  objects: SchemaInput,
  pluralToSlug: Record<string, string>,
  policies?: RecordRoutePolicyMap,
): void {
  const slugToPlural = Object.fromEntries(
    Object.entries(pluralToSlug).map(([plural, slug]) => [slug, plural]),
  )
  const nestedRefPairCounts = buildNestedRefPairCounts(objects, slugToPlural)

  for (const [childSlug, childSchema] of Object.entries(objects)) {
    const childPlural = slugToPlural[childSlug]
    if (!childPlural) continue

    for (const [attrName, attrSchema] of Object.entries(childSchema.attributes)) {
      const raw = attrSchema as { type?: string; object?: string }
      if (typeof attrSchema === 'string' || raw.type !== 'ref' || !raw.object) continue

      const parentPlural = slugToPlural[raw.object]
      if (!parentPlural) continue

      const pairKey = `${parentPlural}:${childPlural}`
      const isAmbiguousPair = (nestedRefPairCounts.get(pairKey) ?? 0) > 1
      const nestedPath = isAmbiguousPair
        ? `/${parentPlural}/:parentId/${childPlural}/by/${attrName}`
        : `/${parentPlural}/:parentId/${childPlural}`

      app.get(nestedPath, async (c) => {
        const db = c.get('db')
        const resource = resolveRecordResource(db, objects, pluralToSlug, childPlural, 'list', policies)
        if (!resource) return c.json({ error: `Unknown resource: ${childPlural}` }, 404)

        const parentId = c.req.param('parentId')
        const maxLimit = c.get('maxLimit')
        const limit = capLimit(c.req.query('limit'), maxLimit)
        const orderBy = c.req.query('orderBy')
        const order = c.req.query('order') as 'asc' | 'desc' | undefined
        const cursor = c.req.query('cursor')
        const queryFilter = parseFilters(c.req.queries() ?? {}, resource.objectSchema)
        const filter = mergeRecordFilters(queryFilter ?? undefined, resource.filter, { [attrName]: parentId })

        if (cursor !== undefined) {
          return c.json(await resource.client.findPage({ filter, limit, orderBy, order, cursor: cursor || undefined }))
        }

        const offset = parseOffset(c.req.query('offset'))
        return c.json(await resource.client.find({ filter, limit, offset, orderBy, order }))
      })

      app.post(nestedPath, async (c) => {
        const db = c.get('db')
        const resource = resolveRecordResource(db, objects, pluralToSlug, childPlural, 'create', policies)
        if (!resource) return c.json({ error: `Unknown resource: ${childPlural}` }, 404)

        const parentId = c.req.param('parentId')
        const body = await c.req.json<Record<string, unknown>>()
        return c.json(await resource.client.create({ ...body, [attrName]: parentId }), 201)
      })
    }
  }
}
