import { Miniflare } from 'miniflare'
import { relate, defineSchema, EventBus } from '@nokto-labs/relate'
import { D1Adapter } from '../src'
import type { D1Database } from '../src'

export const testSchema = defineSchema({
  objects: {
    person: {
      plural: 'people',
      attributes: {
        email: { type: 'email', required: true },
        name: 'text',
        active: 'boolean',
        signedUpAt: 'date',
        tier: { type: 'select', options: ['vip', 'regular', 'trial'] as const },
      },
      uniqueBy: 'email',
    },
    company: {
      plural: 'companies',
      attributes: {
        domain: { type: 'text', required: true },
        name: 'text',
        size: 'number',
      },
      uniqueBy: 'domain',
    },
    deal: {
      plural: 'deals',
      attributes: {
        title: { type: 'text', required: true },
        value: 'number',
        stage: { type: 'select', options: ['lead', 'qualified', 'won'] as const },
      },
    },
  },
})

let mf: Miniflare
let db: D1Database

async function getDB(): Promise<D1Database> {
  if (!mf) {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'test-db' },
    })
    db = await mf.getD1Database('DB') as unknown as D1Database
  }
  return db
}

const ALL_TABLES = [
  'crm_person', 'crm_company', 'crm_deal',
  'crm_relationships', 'crm_activities',
  'crm_lists', 'crm_list_items', 'crm_migrations',
]

/** Wipe all data between tests */
export async function resetDB() {
  const d1 = await getDB()
  for (const table of ALL_TABLES) {
    await d1.prepare(`DELETE FROM ${table}`).run().catch(() => {})
  }
}

export async function createD1TestCRM() {
  const d1 = await getDB()
  const adapter = new D1Adapter(d1)
  const events = new EventBus()
  const crm = relate({ adapter, schema: testSchema, events })
  await crm.migrate()
  return { crm, db: d1, adapter, events }
}

export async function cleanup() {
  if (mf) await mf.dispose()
}
