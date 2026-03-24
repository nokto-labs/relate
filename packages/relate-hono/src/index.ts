import { Hono } from 'hono'
import { type SchemaDefinition, RelateError } from '@nokto-labs/relate'
import type { AnyRelate, HonoEnv } from './types'
import { migrateRoutes } from './routes/migrate'
import { relationshipRoutes } from './routes/relationships'
import { activityRoutes } from './routes/activities'
import { listRoutes } from './routes/lists'
import { recordRoutes } from './routes/records'
import { schemaRoutes } from './routes/schema'
import { validateMaxLimit } from './limits'

export type { AnyRelate } from './types'

type MiddlewareFn = (c: any, next: () => Promise<void>) => Promise<void | Response>

export interface RouteToggles {
  schema?: boolean
  migrate?: boolean
  records?: boolean
  relationships?: boolean
  activities?: boolean
  lists?: boolean
}

export interface RelateRoutesConfig<E extends object> {
  schema: SchemaDefinition
  db: (c: { env: E }) => AnyRelate
  prefix?: string
  middleware?: MiddlewareFn | MiddlewareFn[]
  routes?: RouteToggles
  maxLimit?: number
}

/**
 * Create a Hono app with all Relate routes.
 *
 * @example
 * ```ts
 * app.route('/', relateRoutes({
 *   schema,
 *   db: (c) => relate({ adapter: new D1Adapter(c.env.DB), schema }),
 * }))
 * ```
 */
export function relateRoutes<E extends object = Record<string, unknown>>(
  config: RelateRoutesConfig<E>,
): Hono<{ Bindings: E }> {
  const { schema, db: getDB, prefix, middleware, routes: toggles } = config
  const maxLimit = validateMaxLimit(config.maxLimit)
  const objects = schema.objects
  const enabled = (key: keyof RouteToggles) => {
    if (key === 'schema' || key === 'migrate') {
      return toggles?.[key] === true
    }
    return toggles?.[key] !== false
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const app = new Hono<any>()

  // Build plural → slug map from objects
  const pluralToSlug = Object.fromEntries(
    Object.entries(objects).map(([slug, s]) => [s.plural ?? `${slug}s`, slug]),
  )

  // Error handler
  app.onError((err, c) => {
    if (err instanceof RelateError) {
      return c.json({ error: err.detail }, err.status as any)
    }
    throw err
  })

  // User-provided middleware (auth, logging, etc.)
  if (middleware) {
    const fns = Array.isArray(middleware) ? middleware : [middleware]
    for (const fn of fns) {
      app.use('*', fn)
    }
  }

  // Relate instance per request
  app.use('*', async (c, next) => {
    c.set('db', getDB(c))
    if (maxLimit !== undefined) c.set('maxLimit', maxLimit)
    await next()
  })

  // Mount enabled route groups
  const r = new Hono<HonoEnv>()
  if (enabled('schema')) r.route('/', schemaRoutes(schema))
  if (enabled('migrate')) r.route('/', migrateRoutes())
  if (enabled('relationships')) r.route('/', relationshipRoutes(pluralToSlug))
  if (enabled('activities')) r.route('/', activityRoutes(pluralToSlug))
  if (enabled('lists')) r.route('/', listRoutes(objects))
  if (enabled('records')) r.route('/', recordRoutes(objects, pluralToSlug))

  app.route(prefix ?? '/', r as any)

  return app as Hono<{ Bindings: E }>
}
