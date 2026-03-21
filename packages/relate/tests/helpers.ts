import { createCRM, defineSchema, EventBus } from '../src'
import type { StorageAdapter, UpsertResult, CRMRecord, SchemaDefinition } from '../src'

// ─── In-memory storage for tests ─────────────────────────────────────────────

export function createMockAdapter(): StorageAdapter & { records: Map<string, Map<string, Record<string, unknown>>> } {
  const records = new Map<string, Map<string, Record<string, unknown>>>()

  function getTable(slug: string) {
    if (!records.has(slug)) records.set(slug, new Map())
    return records.get(slug)!
  }

  return {
    records,

    async migrate() {},
    setSchema() {},

    async createRecord(slug, attrs) {
      const id = crypto.randomUUID()
      const now = new Date()
      const record = { id, ...attrs, createdAt: now, updatedAt: now } as CRMRecord
      getTable(slug).set(id, record as Record<string, unknown>)
      return record
    },

    async upsertRecord(slug, uniqueBy, attrs): Promise<UpsertResult> {
      const table = getTable(slug)
      for (const [id, existing] of table) {
        if (existing[uniqueBy] === attrs[uniqueBy]) {
          const merged = { ...existing, ...attrs, updatedAt: new Date() }
          table.set(id, merged)
          return { record: merged as CRMRecord, isNew: false }
        }
      }
      const record = await this.createRecord(slug, attrs)
      return { record, isNew: true }
    },

    async getRecord(slug, id) {
      return (getTable(slug).get(id) as CRMRecord) ?? null
    },

    async findRecords(slug, options) {
      const table = getTable(slug)
      let results = [...table.values()]

      if (options?.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          results = results.filter((r) => r[key] === value)
        }
      }

      if (options?.limit) results = results.slice(0, options.limit)
      return results as CRMRecord[]
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
      return merged as CRMRecord
    },

    async deleteRecord(slug, id) {
      getTable(slug).delete(id)
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
      },
    },
  },
})

// ─── Test context factory ────────────────────────────────────────────────────

export function createTestCRM(schema: SchemaDefinition = testSchema) {
  const adapter = createMockAdapter()
  const events = new EventBus()
  const crm = createCRM({ adapter, schema, events })
  return { crm, adapter, events }
}
