import type { StorageAdapter, RecordMutation } from './adapter'
import type { RelateRecord, SchemaInput, RefAttributeSchema } from './types'
import { RefNotFoundError, RefConstraintError, CascadeDepthError } from './errors'
import { isRefAttribute } from './schema-validation'

const MAX_CASCADE_DEPTH = 10

interface PlannedUpdateMutation {
  type: 'update'
  objectSlug: string
  id: string
  attributes: Record<string, unknown>
  updatedAtMs: number
  record: RelateRecord
}

interface PlannedDeleteMutation {
  type: 'delete'
  objectSlug: string
  id: string
}

interface PlannedCleanupMutation {
  type: 'cleanup'
  objectSlug: string
  id: string
}

export type PlannedRecordMutation =
  | PlannedUpdateMutation
  | PlannedDeleteMutation
  | PlannedCleanupMutation

export type PlannedRecordEvent =
  | { type: 'updated'; objectSlug: string; record: RelateRecord; changes: Record<string, unknown> }
  | { type: 'deleted'; objectSlug: string; id: string }

export async function validateRefs(
  adapter: StorageAdapter,
  schema: SchemaInput,
  objectSlug: string,
  attributes: Record<string, unknown>,
): Promise<void> {
  const objectSchema = schema[objectSlug]
  if (!objectSchema) return

  const checks: Promise<void>[] = []

  for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
    if (!isRefAttribute(attrSchema)) continue
    if (attrSchema.validate === false) continue

    const value = attributes[attrName]
    if (value === undefined || value === null) continue

    checks.push(
      adapter.getRecord(attrSchema.object, value as string).then((record) => {
        if (!record) {
          throw new RefNotFoundError({ object: attrSchema.object, field: attrName, id: value as string })
        }
      }),
    )
  }

  await Promise.all(checks)
}

interface IncomingRef {
  childSlug: string
  attrName: string
  schema: RefAttributeSchema
}

function findIncomingRefs(schema: SchemaInput, targetSlug: string): IncomingRef[] {
  const refs: IncomingRef[] = []
  for (const [slug, objectSchema] of Object.entries(schema)) {
    for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
      if (isRefAttribute(attrSchema) && attrSchema.object === targetSlug) {
        refs.push({ childSlug: slug, attrName, schema: attrSchema })
      }
    }
  }
  return refs
}

export async function planRecordDelete(
  adapter: StorageAdapter,
  schema: SchemaInput,
  objectSlug: string,
  recordId: string,
  depth = 0,
): Promise<PlannedRecordMutation[]> {
  if (depth > MAX_CASCADE_DEPTH) {
    throw new CascadeDepthError({ object: objectSlug, id: recordId })
  }

  const incomingRefs = findIncomingRefs(schema, objectSlug)
  if (incomingRefs.length === 0) return []

  const refRecords = await Promise.all(
    incomingRefs.map(async (ref) => {
      const records = await adapter.findRecords(ref.childSlug, {
        filter: { [ref.attrName]: recordId },
      })
      return { ref, records }
    }),
  )

  for (const { ref, records } of refRecords) {
    const onDelete = ref.schema.onDelete ?? 'restrict'
    if (onDelete === 'restrict' && records.length > 0) {
      throw new RefConstraintError({
        object: objectSlug,
        field: ref.attrName,
        referencedBy: ref.childSlug,
      })
    }
  }

  const plan: PlannedRecordMutation[] = []

  for (const { ref, records } of refRecords) {
    const onDelete = ref.schema.onDelete ?? 'restrict'
    if (records.length === 0) continue

    if (onDelete === 'cascade') {
      for (const record of records) {
        const id = (record as { id: string }).id
        plan.push(...await planRecordDelete(adapter, schema, ref.childSlug, id, depth + 1))
        plan.push({ type: 'cleanup', objectSlug: ref.childSlug, id })
        plan.push({ type: 'delete', objectSlug: ref.childSlug, id })
      }
      continue
    }

    if (onDelete === 'set_null') {
      for (const record of records) {
        const updatedAtMs = Date.now()
        const changes = { [ref.attrName]: null }
        plan.push({
          type: 'update',
          objectSlug: ref.childSlug,
          id: (record as { id: string }).id,
          attributes: changes,
          updatedAtMs,
          record: {
            ...(record as RelateRecord),
            ...changes,
            updatedAt: new Date(updatedAtMs),
          },
        })
      }
    }
  }

  return plan
}

function toRecordMutation(mutation: PlannedRecordMutation): RecordMutation {
  if (mutation.type === 'update') {
    const { record: _record, ...rest } = mutation
    return rest
  }

  return mutation
}

function toEvents(plan: PlannedRecordMutation[]): PlannedRecordEvent[] {
  const events: PlannedRecordEvent[] = []

  for (const mutation of plan) {
    if (mutation.type === 'update') {
      events.push({
        type: 'updated',
        objectSlug: mutation.objectSlug,
        record: mutation.record,
        changes: mutation.attributes,
      })
    } else if (mutation.type === 'delete') {
      events.push({ type: 'deleted', objectSlug: mutation.objectSlug, id: mutation.id })
    }
  }

  return events
}

export async function applyRecordMutationPlan(
  adapter: StorageAdapter,
  plan: PlannedRecordMutation[],
): Promise<PlannedRecordEvent[]> {
  if (plan.length === 0) return []

  if (adapter.commitRecordMutations) {
    await adapter.commitRecordMutations(plan.map(toRecordMutation))
    return toEvents(plan)
  }

  const events: PlannedRecordEvent[] = []

  for (const mutation of plan) {
    if (mutation.type === 'update') {
      const record = await adapter.updateRecord(mutation.objectSlug, mutation.id, mutation.attributes)
      events.push({
        type: 'updated',
        objectSlug: mutation.objectSlug,
        record,
        changes: mutation.attributes,
      })
      continue
    }

    if (mutation.type === 'cleanup') {
      await adapter.cleanupRecordRefs?.(mutation.objectSlug, mutation.id)
      continue
    }

    await adapter.deleteRecord(mutation.objectSlug, mutation.id)
    events.push({ type: 'deleted', objectSlug: mutation.objectSlug, id: mutation.id })
  }

  return events
}
