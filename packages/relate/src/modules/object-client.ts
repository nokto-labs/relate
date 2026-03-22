import type { StorageAdapter, PaginatedResult } from '../adapter'
import type { RelateRecord, ObjectSchema, InferAttributes, FilterOperator } from '../types'
import type { EventBus } from '../events'
import { DuplicateError, ValidationError, NotFoundError } from '../errors'
import { validateAttributes } from '../validation'

type FilterInput<S extends ObjectSchema> = {
  [K in keyof InferAttributes<S>]?: InferAttributes<S>[K] | FilterOperator<InferAttributes<S>[K]>
}

export class ObjectClient<S extends ObjectSchema> {
  constructor(
    private readonly adapter: StorageAdapter,
    private readonly slug: string,
    private readonly schema: S,
    private readonly events?: EventBus,
    private readonly crmRef?: () => unknown,
  ) {}

  async create(attributes: InferAttributes<S>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>)

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
    await this.events?.emit(`${this.slug}.created`, { record, crm: this.crmRef?.() })
    return record
  }

  async upsert(attributes: InferAttributes<S>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>)

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
      ? { record, crm: this.crmRef?.() }
      : { record, changes: attributes as Record<string, unknown>, crm: this.crmRef?.() }
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

  async update(id: string, attributes: Partial<InferAttributes<S>>): Promise<RelateRecord<S>> {
    validateAttributes(this.slug, this.schema, attributes as Record<string, unknown>, { partial: true })

    const record = await this.adapter.updateRecord(
      this.slug,
      id,
      attributes as Record<string, unknown>,
    ) as RelateRecord<S>
    await this.events?.emit(`${this.slug}.updated`, {
      record,
      changes: attributes as Record<string, unknown>,
      crm: this.crmRef?.(),
    })
    return record
  }

  async delete(id: string): Promise<void> {
    const existing = await this.adapter.getRecord(this.slug, id)
    if (!existing) {
      throw new NotFoundError({ code: 'RECORD_NOT_FOUND', object: this.slug, id }, `Record "${id}" not found in "${this.slug}"`)
    }

    await this.adapter.deleteRecord(this.slug, id)
    await this.adapter.cleanupRecordRefs?.(this.slug, id)
    await this.events?.emit(`${this.slug}.deleted`, { id, crm: this.crmRef?.() })
  }
}
