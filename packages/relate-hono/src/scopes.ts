import type { SchemaDefinition } from '@nokto-labs/relate'
import { ValidationError } from '@nokto-labs/relate'
import type { RecordRouteOperation, RecordRoutePolicyMap } from './routes/records'

export type MiddlewareFn = (c: any, next: () => Promise<void>) => Promise<void | Response>

const ALL_RECORD_OPERATIONS: RecordRouteOperation[] = ['create', 'upsert', 'list', 'get', 'count', 'update', 'delete']

export interface ScopedRecordObjectConfig {
  operations?: RecordRouteOperation[]
  filter?: Record<string, unknown>
}

export interface RecordRouteScopeConfig {
  prefix?: string
  middleware?: MiddlewareFn | MiddlewareFn[]
  objects: 'all' | Record<string, ScopedRecordObjectConfig>
}

export interface NormalizedRecordScope {
  prefix?: string
  middleware?: MiddlewareFn | MiddlewareFn[]
  policies: RecordRoutePolicyMap
}

export function applyMiddleware(app: { use(path: string, fn: MiddlewareFn): unknown }, middleware?: MiddlewareFn | MiddlewareFn[]): void {
  if (!middleware) return
  const fns = Array.isArray(middleware) ? middleware : [middleware]
  for (const fn of fns) {
    app.use('*', fn)
  }
}

export function normalizeRecordScopes(
  schema: SchemaDefinition,
  scopes?: Record<string, RecordRouteScopeConfig>,
): NormalizedRecordScope[] {
  if (!scopes) return []

  const normalized = Object.values(scopes).map((scope) => {
    if (scope.objects === 'all') {
      return {
        prefix: scope.prefix,
        middleware: scope.middleware,
        policies: Object.fromEntries(
          Object.keys(schema.objects).map((slug) => [
            slug,
            { operations: new Set<RecordRouteOperation>(ALL_RECORD_OPERATIONS) },
          ]),
        ) as RecordRoutePolicyMap,
      }
    }

    const policies: RecordRoutePolicyMap = {}

    for (const [slug, config] of Object.entries(scope.objects)) {
      if (!(slug in schema.objects)) {
        throw new ValidationError({
          message: `Unknown scoped record object "${slug}"`,
          field: slug,
        })
      }

      const operations = config.operations ?? ALL_RECORD_OPERATIONS
      for (const operation of operations) {
        if (!ALL_RECORD_OPERATIONS.includes(operation)) {
          throw new ValidationError({
            message: `Invalid record route operation "${operation}" on scoped object "${slug}"`,
            field: slug,
          })
        }
      }

      policies[slug] = {
        operations: new Set<RecordRouteOperation>(operations),
        filter: config.filter,
      }
    }

    return {
      prefix: scope.prefix,
      middleware: scope.middleware,
      policies,
    }
  })

  const coveredObjects = new Set(
    normalized.flatMap((scope) => Object.keys(scope.policies)),
  )
  const uncovered = Object.keys(schema.objects).filter((slug) => !coveredObjects.has(slug))
  if (uncovered.length > 0) {
    throw new ValidationError({
      message: `Scoped record routes must cover every object or omit scopes entirely. Missing: ${uncovered.join(', ')}`,
      fields: uncovered,
    })
  }

  return normalized
}
