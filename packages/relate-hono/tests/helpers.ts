import { Miniflare } from 'miniflare'
import { createCRM, defineSchema, EventBus } from '@nokto-labs/relate'
import { D1Adapter } from '../../relate-d1/src'
import type { D1Database } from '../../relate-d1/src'
import { relateRoutes } from '../src'

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
    deal: {
      plural: 'deals',
      attributes: {
        title: { type: 'text', required: true },
        value: 'number',
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

const TABLES = ['crm_person', 'crm_deal', 'crm_relationships', 'crm_activities', 'crm_lists', 'crm_list_items', 'crm_migrations']

export async function resetDB() {
  const d1 = await getDB()
  for (const t of TABLES) {
    await d1.prepare(`DELETE FROM ${t}`).run().catch(() => {})
  }
}

export async function createTestApp(overrides?: Record<string, unknown>) {
  const d1 = await getDB()
  const events = new EventBus()

  // Ensure tables exist
  const adapter = new D1Adapter(d1)
  await adapter.migrate(testSchema.objects)

  const app = relateRoutes({
    schema: testSchema,
    crm: () => createCRM({ adapter: new D1Adapter(d1), schema: testSchema, events }),
    events,
    ...overrides,
  } as any)

  return { app, events }
}

export async function cleanup() {
  if (mf) await mf.dispose()
}

export function req(app: any, method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
}
