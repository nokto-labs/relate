import { Hono } from 'hono'
import type { SchemaInput } from '@nokto-labs/relate'
import type { HonoEnv } from '../types'
import { registerFlatRecordRoutes } from './record-flat-routes'
import { registerNestedRecordRoutes } from './record-nested-routes'
import type { RecordRouteOperation, RecordRoutePolicy, RecordRoutePolicyMap } from './record-route-utils'

export type { RecordRouteOperation, RecordRoutePolicy, RecordRoutePolicyMap } from './record-route-utils'

export function recordRoutes(
  objects: SchemaInput,
  pluralToSlug: Record<string, string>,
  policies?: RecordRoutePolicyMap,
) {
  const app = new Hono<HonoEnv>()

  registerNestedRecordRoutes(app, objects, pluralToSlug, policies)
  registerFlatRecordRoutes(app, objects, pluralToSlug, policies)

  return app
}
