import { Miniflare } from 'miniflare'
import { relate, defineSchema, EventBus } from '../../relate/src'
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
    price: {
      plural: 'prices',
      attributes: {
        name: 'text',
        amountCents: { type: 'number', required: true },
      },
    },
    ticket: {
      plural: 'tickets',
      attributes: {
        price: { type: 'ref', object: 'price', required: true },
        paymentStatus: { type: 'select', options: ['pending', 'confirmed', 'refunded'] as const },
      },
    },
  },
  relationships: {
    works_at: { from: 'person', to: 'company' },
    owner: { from: 'person', to: 'deal' },
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
  'relate_person', 'relate_company', 'relate_deal', 'relate_price', 'relate_ticket',
  'relate_relationships', 'relate_activities',
  'relate_lists', 'relate_list_items', 'relate_migrations',
]

/** Wipe all data between tests */
export async function resetDB() {
  const d1 = await getDB()
  for (const table of ALL_TABLES) {
    await d1.prepare(`DELETE FROM ${table}`).run().catch(() => {})
  }
}

export async function createD1TestDB() {
  const d1 = await getDB()
  const adapter = new D1Adapter(d1)
  const events = new EventBus()
  const db = relate({ adapter, schema: testSchema, events })
  await db.migrate()
  return { db, d1, adapter, events }
}

export async function cleanup() {
  if (mf) await mf.dispose()
}
