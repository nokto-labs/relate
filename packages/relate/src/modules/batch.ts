import type { StorageAdapter, CreateRecordMutation, UpdateRecordMutation } from '../adapter'
import type { EventBus } from '../events'
import type { SchemaInput, ObjectSchema, InferAttributes, RelateRecord } from '../types'
import { DuplicateError, NotFoundError } from '../errors'
import { generateId } from '../id'
import { applyRecordMutationPlan, validateRefs, type PlannedRecordMutation } from '../ref-integrity'
import { validateAttributes } from '../validation'

export interface BatchCreateHandle {
  id: string
}

export interface BatchObjectClient<S extends ObjectSchema> {
  create(attributes: InferAttributes<S>): BatchCreateHandle
  update(id: string, attributes: Partial<InferAttributes<S>>): void
}

export type BatchBuilder<T extends SchemaInput> = {
  [K in keyof T]: BatchObjectClient<Extract<T[K], ObjectSchema>>
}

type QueuedBatchMutation = CreateRecordMutation | UpdateRecordMutation

function isPromiseLike(value: unknown): value is Promise<unknown> {
  return typeof value === 'object' && value !== null && 'then' in value && typeof value.then === 'function'
}

function stateForObject(
  state: Map<string, Map<string, RelateRecord>>,
  objectSlug: string,
): Map<string, RelateRecord> {
  let table = state.get(objectSlug)
  if (!table) {
    table = new Map<string, RelateRecord>()
    state.set(objectSlug, table)
  }
  return table
}

async function getCurrentRecord(
  adapter: StorageAdapter,
  state: Map<string, Map<string, RelateRecord>>,
  objectSlug: string,
  id: string,
): Promise<RelateRecord | null> {
  const table = stateForObject(state, objectSlug)
  const cached = table.get(id)
  if (cached) return cached

  const record = await adapter.getRecord(objectSlug, id)
  if (record) table.set(id, record)
  return record
}

async function assertUniqueByAvailable(
  adapter: StorageAdapter,
  state: Map<string, Map<string, RelateRecord>>,
  mutation: QueuedBatchMutation,
  objectSchema: ObjectSchema,
): Promise<void> {
  const uniqueBy = objectSchema.uniqueBy
  if (!uniqueBy) return

  const value = mutation.attributes[uniqueBy]
  if (value === undefined) return

  const stateTable = stateForObject(state, mutation.objectSlug)
  for (const record of stateTable.values()) {
    if (record[uniqueBy] === value && record.id !== mutation.id) {
      throw new DuplicateError({ object: mutation.objectSlug, field: uniqueBy, value })
    }
  }

  const matches = await adapter.findRecords(mutation.objectSlug, {
    filter: { [uniqueBy]: value },
    limit: 2,
  })

  for (const match of matches) {
    const current = stateTable.get(match.id) ?? match
    if (current[uniqueBy] === value && current.id !== mutation.id) {
      throw new DuplicateError({ object: mutation.objectSlug, field: uniqueBy, value })
    }
  }
}

function buildCreatedRecord(
  mutation: CreateRecordMutation,
): RelateRecord {
  return {
    id: mutation.id,
    ...mutation.attributes,
    createdAt: new Date(mutation.createdAtMs),
    updatedAt: new Date(mutation.createdAtMs),
  } as RelateRecord
}

async function planBatchMutations(
  adapter: StorageAdapter,
  schema: SchemaInput,
  mutations: QueuedBatchMutation[],
): Promise<PlannedRecordMutation[]> {
  const plan: PlannedRecordMutation[] = []
  const state = new Map<string, Map<string, RelateRecord>>()

  for (const mutation of mutations) {
    const objectSchema = schema[mutation.objectSlug]
    if (!objectSchema) {
      throw new Error(`Unknown object: "${mutation.objectSlug}"`)
    }

    await assertUniqueByAvailable(adapter, state, mutation, objectSchema)
    await validateRefs(adapter, schema, mutation.objectSlug, mutation.attributes, {
      resolveRecord: (targetObjectSlug, id) => getCurrentRecord(adapter, state, targetObjectSlug, id),
    })

    if (mutation.type === 'create') {
      const record = buildCreatedRecord(mutation)
      stateForObject(state, mutation.objectSlug).set(mutation.id, record)
      plan.push({
        ...mutation,
        record,
      })
      continue
    }

    const existing = await getCurrentRecord(adapter, state, mutation.objectSlug, mutation.id)
    if (!existing) {
      throw new NotFoundError(
        { code: 'RECORD_NOT_FOUND', object: mutation.objectSlug, id: mutation.id },
        `Record "${mutation.id}" not found in "${mutation.objectSlug}"`,
      )
    }

    const record = {
      ...existing,
      ...mutation.attributes,
      updatedAt: new Date(mutation.updatedAtMs),
    } as RelateRecord

    stateForObject(state, mutation.objectSlug).set(mutation.id, record)
    plan.push({
      ...mutation,
      record,
    })
  }

  return plan
}

function createBatchBuilder<T extends SchemaInput>(
  schema: T,
  mutations: QueuedBatchMutation[],
  batchTimestampMs: number,
): BatchBuilder<T> {
  return Object.fromEntries(
    Object.entries(schema).map(([objectSlug, objectSchema]) => [
      objectSlug,
      {
        create(attributes: Record<string, unknown>) {
          validateAttributes(objectSlug, objectSchema, attributes)
          const queuedAttributes = { ...attributes }

          const mutation: CreateRecordMutation = {
            type: 'create',
            objectSlug,
            id: generateId(objectSchema),
            attributes: queuedAttributes,
            createdAtMs: batchTimestampMs,
          }

          mutations.push(mutation)
          return { id: mutation.id }
        },

        update(id: string, attributes: Record<string, unknown>) {
          validateAttributes(objectSlug, objectSchema, attributes, { partial: true })
          const queuedAttributes = { ...attributes }

          mutations.push({
            type: 'update',
            objectSlug,
            id,
            attributes: queuedAttributes,
            updatedAtMs: batchTimestampMs,
          })
        },
      },
    ]),
  ) as BatchBuilder<T>
}

export async function executeBatch<T extends SchemaInput, R>(
  adapter: StorageAdapter,
  schema: T,
  events: EventBus | undefined,
  dbRef: () => unknown,
  builder: (batch: BatchBuilder<T>) => R,
): Promise<R> {
  if (!adapter.commitRecordMutations) {
    throw new Error('This adapter does not support batch writes')
  }

  const mutations: QueuedBatchMutation[] = []
  const batchTimestampMs = Date.now()
  const batchBuilder = createBatchBuilder(schema, mutations, batchTimestampMs)
  const result = builder(batchBuilder)

  if (isPromiseLike(result)) {
    throw new Error('db.batch() callback must be synchronous')
  }

  const plannedMutations = await planBatchMutations(adapter, schema, mutations)
  const plannedEvents = await applyRecordMutationPlan(adapter, plannedMutations)

  for (const event of plannedEvents) {
    if (event.type === 'created') {
      await events?.emit(`${event.objectSlug}.created`, {
        record: event.record,
        db: dbRef(),
      })
    } else if (event.type === 'updated') {
      await events?.emit(`${event.objectSlug}.updated`, {
        record: event.record,
        changes: event.changes,
        db: dbRef(),
      })
    } else {
      await events?.emit(`${event.objectSlug}.deleted`, {
        id: event.id,
        db: dbRef(),
      })
    }
  }

  return result
}
