import { matchesFilter, mergeFilters, type ObjectSchema, type SchemaInput } from '@nokto-labs/relate'
import type { AnyObjectClient, AnyRelate } from '../types'

export type RecordRouteOperation = 'create' | 'upsert' | 'list' | 'get' | 'count' | 'update' | 'delete'

export interface RecordRoutePolicy {
  operations: Set<RecordRouteOperation>
  filter?: Record<string, unknown>
}

export type RecordRoutePolicyMap = Record<string, RecordRoutePolicy>

export interface RecordRouteResource {
  client: AnyObjectClient
  objectSchema: ObjectSchema
  filter?: Record<string, unknown>
}

export function resolveRecordResource(
  db: AnyRelate,
  objects: SchemaInput,
  pluralToSlug: Record<string, string>,
  plural: string,
  operation: RecordRouteOperation,
  policies?: RecordRoutePolicyMap,
): RecordRouteResource | null {
  const slug = pluralToSlug[plural]
  if (!slug) return null

  const policy = policies?.[slug]
  if (policies && !policy) return null
  if (policy && !policy.operations.has(operation)) return null

  const client = (db as unknown as Record<string, AnyObjectClient>)[slug]
  const objectSchema = objects[slug]
  if (!client || !objectSchema) return null

  return { client, objectSchema, filter: policy?.filter }
}

export function matchesRecordFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  return matchesFilter(record, filter)
}

export function mergeRecordFilters(
  queryFilter?: Record<string, unknown>,
  enforcedFilter?: Record<string, unknown>,
  extraFilter?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  return mergeFilters(queryFilter, enforcedFilter, extraFilter)
}
