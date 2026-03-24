import type { StorageAdapter, PaginatedResult } from '../adapter'
import type { RelateRecord, ObjectSchema, SchemaInput, InferAttributes } from '../types'
import type { EventBus } from '../events'
import { DuplicateError, ValidationError, NotFoundError } from '../errors'
import { validateAttributes } from '../validation'
import { validateRefs, planRecordDelete, applyRecordMutationPlan } from '../ref-integrity'
import { aggregateObjectRecords, type AggregateInput, type FilterInput } from './object-client-aggregate'

export class ObjectClient<S extends ObjectSchema, FullSchema extends SchemaInput = SchemaInput> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly slug: string,
    private readonly schema: S,
    private readonly fullSchema: FullSchema,
    private readonly events?: EventBus,
    private readonly dbRef?: () => unknown,
  ) {}

  async create(attributes: InferAttributes<S>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>)
    await validateRefs(this.adapter, this.fullSchema, this.slug, attributes as Record<string, unknown>)

    if (this.schema.uniqueBy) {
      const key = this.schema.uniqueBy
      const value = (attributes as Record<string, unknown>)[key]
      if (value !== undefined) {
        const existing = await this.adapter.findRecords(this.slug, {
          filter: { [key]: value },
          limit: 1,
        })
        if (existing.length > 0) {
          throw new DuplicateError({ object: this.slug, field: key, value })
        }
      }
    }

    const record = await this.adapter.createRecord(
      this.slug,
      attributes as Record<string, unknown>,
    ) as RelateRecord<S>
    await this.events?.emit(`${this.slug}.created`, { record, db: this.dbRef?.() })
    return record
  }

  async upsert(attributes: InferAttributes<S>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>)
    await validateRefs(this.adapter, this.fullSchema, this.slug, attributes as Record<string, unknown>)

    if (!this.schema.uniqueBy) {
      throw new ValidationError({
        code: 'INVALID_OPERATION',
        message: `Object "${this.slug}" has no uniqueBy defined — use .create() instead`,
        object: this.slug,
      })
    }
    const { record, isNew } = await this.adapter.upsertRecord(
      this.slug,
      this.schema.uniqueBy,
      attributes as Record<string, unknown>,
    )
    const event = isNew ? 'created' : 'updated'
    const payload = isNew
      ? { record, db: this.dbRef?.() }
      : { record, changes: attributes as Record<string, unknown>, db: this.dbRef?.() }
    await this.events?.emit(`${this.slug}.${event}`, payload)
    return record as RelateRecord<S>
  }

  async get(id: string): Promise<RelateRecord<S> | null> {
    return this.adapter.getRecord(this.slug, id) as Promise<RelateRecord<S> | null>
  }

  async find(options?: {
    filter?: FilterInput<S>
    limit?: number
    offset?: number
    orderBy?: string
    order?: 'asc' | 'desc'
  }): Promise<RelateRecord<S>[]> {
    return this.adapter.findRecords(this.slug, {
      filter: options?.filter as Record<string, unknown> | undefined,
      limit: options?.limit,
      offset: options?.offset,
      orderBy: options?.orderBy,
      order: options?.order,
    }) as Promise<RelateRecord<S>[]>
  }

  async findPage(options?: {
    filter?: FilterInput<S>
    limit?: number
    orderBy?: string
    order?: 'asc' | 'desc'
    cursor?: string
  }): Promise<PaginatedResult<RelateRecord<S>>> {
    if (!this.adapter.findRecordsPage) {
      const records = await this.find(options)
      return { records }
    }
    return this.adapter.findRecordsPage(this.slug, {
      filter: options?.filter as Record<string, unknown> | undefined,
      limit: options?.limit,
      orderBy: options?.orderBy,
      order: options?.order,
      cursor: options?.cursor,
    }) as Promise<PaginatedResult<RelateRecord<S>>>
  }

  async count(filter?: FilterInput<S>): Promise<number> {
    return this.adapter.countRecords(this.slug, filter as Record<string, unknown> | undefined)
  }

  async aggregate(options: AggregateInput<S, FullSchema>) {
    return aggregateObjectRecords(this.adapter, this.slug, this.schema, this.fullSchema, options)
  }

  async update(id: string, attributes: Partial<InferAttributes<S>>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>, { partial: true })
    await validateRefs(this.adapter, this.fullSchema, this.slug, attributes as Record<string, unknown>)

    const record = await this.adapter.updateRecord(
      this.slug,
      id,
      attributes as Record<string, unknown>,
    ) as RelateRecord<S>
    await this.events?.emit(`${this.slug}.updated`, {
      record,
      changes: attributes as Record<string, unknown>,
      db: this.dbRef?.(),
    })
    return record
  }

  async delete(id: string): Promise<void> {
    const existing = await this.adapter.getRecord(this.slug, id)
    if (!existing) {
      throw new NotFoundError({ code: 'RECORD_NOT_FOUND', object: this.slug, id }, `Record "${id}" not found in "${this.slug}"`)
    }

    const plan = await planRecordDelete(this.adapter, this.fullSchema, this.slug, id)
    plan.push({ type: 'cleanup', objectSlug: this.slug, id })
    plan.push({ type: 'delete', objectSlug: this.slug, id })

    const events = await applyRecordMutationPlan(this.adapter, plan)

    for (const event of events) {
      if (event.type === 'updated') {
        await this.events?.emit(`${event.objectSlug}.updated`, {
          record: event.record,
          changes: event.changes,
          db: this.dbRef?.(),
        })
      } else {
        await this.events?.emit(`${event.objectSlug}.deleted`, { id: event.id, db: this.dbRef?.() })
      }
    }
  }
}
