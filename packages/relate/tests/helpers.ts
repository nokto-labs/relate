import { relate, defineSchema, EventBus, DuplicateError, NotFoundError, matchesFilter, generateId } from '../src'
import type { StorageAdapter, UpsertResult, RelateRecord, SchemaDefinition, SchemaInput, RecordMutation, ClaimWebhookInput, WebhookClaimResult, WebhookExecution } from '../src'

// ─── In-memory storage for tests ─────────────────────────────────────────────

export function createMockAdapter(): StorageAdapter & { records: Map<string, Map<string, Record<string, unknown>>> } {
  const records = new Map<string, Map<string, Record<string, unknown>>>()
  const webhooks = new Map<string, WebhookExecution & { claimToken?: string }>()
  let schema: SchemaInput = {}

  function getTable(slug: string) {
    if (!records.has(slug)) records.set(slug, new Map())
    return records.get(slug)!
  }

  function cloneRecords() {
    return new Map(
      [...records.entries()].map(([slug, table]) => [
        slug,
        new Map([...table.entries()].map(([id, record]) => [id, { ...record }])),
      ]),
    )
  }

  function replaceRecords(next: Map<string, Map<string, Record<string, unknown>>>) {
    records.clear()
    for (const [slug, table] of next.entries()) {
      records.set(slug, new Map(table))
    }
  }

  function findDuplicateRecord(
    snapshot: Map<string, Map<string, Record<string, unknown>>>,
    slug: string,
    recordId: string,
    uniqueBy: string,
    value: unknown,
  ) {
    const table = snapshot.get(slug)
    if (!table) return null

    for (const [id, record] of table.entries()) {
      if (id !== recordId && record[uniqueBy] === value) {
        return record
      }
    }

    return null
  }

  const adapter: StorageAdapter & { records: Map<string, Map<string, Record<string, unknown>>> } = {
    records,

    async migrate() {},
    setSchema(nextSchema) { schema = nextSchema },

    async createRecord(slug, attrs) {
      const objectSchema = schema[slug]
      const id = objectSchema ? generateId(objectSchema) : crypto.randomUUID()
      const now = new Date()
      const record = { id, ...attrs, createdAt: now, updatedAt: now } as RelateRecord
      getTable(slug).set(id, record as Record<string, unknown>)
      return record
    },

    async upsertRecord(slug, uniqueBy, attrs): Promise<UpsertResult> {
      const table = getTable(slug)
      for (const [id, existing] of table) {
        if (existing[uniqueBy] === attrs[uniqueBy]) {
          const merged = { ...existing, ...attrs, updatedAt: new Date() }
          table.set(id, merged)
          return { record: merged as RelateRecord, isNew: false }
        }
      }
      const record = await this.createRecord(slug, attrs)
      return { record, isNew: true }
    },

    async getRecord(slug, id) {
      return (getTable(slug).get(id) as RelateRecord) ?? null
    },

    async findRecords(slug, options) {
      const table = getTable(slug)
      let results = [...table.values()]

      if (options?.filter) {
        results = results.filter((record) => matchesFilter(record, options.filter!))
      }

      if (options?.limit) results = results.slice(0, options.limit)
      return results as RelateRecord[]
    },

    async countRecords(slug, filter) {
      return (await this.findRecords(slug, { filter })).length
    },

    async updateRecord(slug, id, attrs) {
      const table = getTable(slug)
      const existing = table.get(id)
      if (!existing) throw new Error(`Not found: ${id}`)
      const merged = { ...existing, ...attrs, updatedAt: new Date() }
      table.set(id, merged)
      return merged as RelateRecord
    },

    async deleteRecord(slug, id) {
      getTable(slug).delete(id)
    },

    async claimWebhook(input: ClaimWebhookInput): Promise<WebhookClaimResult> {
      const now = new Date(input.claimedAtMs)
      const leaseExpiresAt = new Date(input.leaseExpiresAtMs)
      const existing = webhooks.get(input.externalId)

      if (!existing) {
        const execution: WebhookExecution & { claimToken?: string } = {
          externalId: input.externalId,
          claimToken: input.claimToken,
          claimedAt: now,
          leaseExpiresAt,
          attemptCount: 1,
          createdAt: now,
          updatedAt: now,
        }
        webhooks.set(input.externalId, execution)
        return { status: 'claimed', execution }
      }

      if (existing.processedAt) {
        return { status: 'processed', execution: existing }
      }

      const activeClaim = existing.claimToken
        && existing.leaseExpiresAt
        && existing.leaseExpiresAt.getTime() >= input.claimedAtMs

      if (activeClaim) {
        return { status: 'processing', execution: existing }
      }

      const updated: WebhookExecution & { claimToken?: string } = {
        ...existing,
        claimToken: input.claimToken,
        claimedAt: now,
        leaseExpiresAt,
        lastError: undefined,
        attemptCount: existing.attemptCount + 1,
        updatedAt: now,
      }
      webhooks.set(input.externalId, updated)
      return { status: 'claimed', execution: updated }
    },

    async completeWebhook(externalId, claimToken, processedAtMs) {
      const existing = webhooks.get(externalId)
      if (!existing || existing.claimToken !== claimToken) return

      const processedAt = new Date(processedAtMs)
      webhooks.set(externalId, {
        ...existing,
        claimToken: undefined,
        leaseExpiresAt: undefined,
        processedAt,
        lastError: undefined,
        updatedAt: processedAt,
      })
    },

    async failWebhook(externalId, claimToken, failedAtMs, errorMessage) {
      const existing = webhooks.get(externalId)
      if (!existing || existing.claimToken !== claimToken) return

      const failedAt = new Date(failedAtMs)
      webhooks.set(externalId, {
        ...existing,
        claimToken: undefined,
        leaseExpiresAt: undefined,
        lastError: errorMessage,
        updatedAt: failedAt,
      })
    },

    async cleanupWebhooks(processedBeforeMs) {
      for (const [externalId, execution] of webhooks.entries()) {
        if (execution.processedAt && execution.processedAt.getTime() < processedBeforeMs) {
          webhooks.delete(externalId)
        }
      }
    },

    async commitRecordMutations(mutations: RecordMutation[]) {
      const snapshot = cloneRecords()

      for (const mutation of mutations) {
        const table = snapshot.get(mutation.objectSlug) ?? new Map<string, Record<string, unknown>>()
        snapshot.set(mutation.objectSlug, table)
        const objectSchema = schema[mutation.objectSlug]

        if (mutation.type === 'create') {
          const uniqueBy = objectSchema?.uniqueBy
          if (uniqueBy) {
            const uniqueValue = mutation.attributes[uniqueBy]
            if (uniqueValue !== undefined && findDuplicateRecord(snapshot, mutation.objectSlug, mutation.id, uniqueBy, uniqueValue)) {
              throw new DuplicateError({ object: mutation.objectSlug, field: uniqueBy, value: uniqueValue })
            }
          }

          table.set(mutation.id, {
            id: mutation.id,
            ...mutation.attributes,
            createdAt: new Date(mutation.createdAtMs),
            updatedAt: new Date(mutation.createdAtMs),
          })
          continue
        }

        if (mutation.type === 'update') {
          const existing = table.get(mutation.id)
          if (!existing) {
            throw new NotFoundError(
              { code: 'RECORD_NOT_FOUND', object: mutation.objectSlug, id: mutation.id },
              `Record "${mutation.id}" not found in "${mutation.objectSlug}"`,
            )
          }

          const uniqueBy = objectSchema?.uniqueBy
          if (uniqueBy && mutation.attributes[uniqueBy] !== undefined) {
            const uniqueValue = mutation.attributes[uniqueBy]
            if (findDuplicateRecord(snapshot, mutation.objectSlug, mutation.id, uniqueBy, uniqueValue)) {
              throw new DuplicateError({ object: mutation.objectSlug, field: uniqueBy, value: uniqueValue })
            }
          }

          table.set(mutation.id, {
            ...existing,
            ...mutation.attributes,
            updatedAt: new Date(mutation.updatedAtMs),
          })
          continue
        }

        if (mutation.type === 'delete') {
          table.delete(mutation.id)
          continue
        }

        if (mutation.type === 'cleanup') {
          continue
        }
      }

      replaceRecords(snapshot)
    },

    async createRelationship() { return {} as any },
    async listRelationships() { return [] },
    async updateRelationship() { return {} as any },
    async deleteRelationship() {},
    async trackActivity() { return {} as any },
    async listActivities() { return [] },
    async createList() { return {} as any },
    async getList() { return null },
    async listLists() { return [] },
    async updateList() { return {} as any },
    async deleteList() {},
    async addToList() {},
    async removeFromList() {},
    async listItems() { return { records: [] } },
    async countListItems() { return 0 },
  }

  return adapter
}

// ─── Test schema ─────────────────────────────────────────────────────────────

export const testSchema = defineSchema({
  objects: {
    person: {
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        active: 'boolean',
        signedUpAt: 'date',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
      },
      uniqueBy: 'email',
    },
    deal: {
      attributes: {
        title: { type: 'text', required: true },
        value: 'number',
        stage: { type: 'select', options: ['lead', 'qualified', 'won'] as const },
      },
    },
    price: {
      attributes: {
        name: 'text',
        amountCents: { type: 'number', required: true },
      },
    },
    ticket: {
      attributes: {
        price: { type: 'ref', object: 'price', required: true },
        paymentStatus: { type: 'select', options: ['pending', 'confirmed', 'refunded'] as const },
      },
    },
  },
})

// ─── Test context factory ────────────────────────────────────────────────────

export function createTestDB(schema: SchemaDefinition = testSchema) {
  const adapter = createMockAdapter()
  const events = new EventBus()
  const db = relate({ adapter, schema, events })
  return { db, adapter, events }
}
