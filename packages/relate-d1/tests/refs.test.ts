import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { Miniflare } from 'miniflare'
import { relate, defineSchema, EventBus, RefConstraintError } from '../../relate/src'
import { D1Adapter } from '../src'
import type { D1Database } from '../src'

const schema = defineSchema({
  objects: {
    guest: {
      plural: 'guests',
      attributes: {
        name: { type: 'text', required: true },
      },
    },
    event: {
      plural: 'events',
      attributes: {
        title: { type: 'text', required: true },
      },
    },
    checkin: {
      plural: 'checkins',
      attributes: {
        guest: { type: 'ref', object: 'guest', required: true, onDelete: 'cascade' },
        event: { type: 'ref', object: 'event', required: true, onDelete: 'restrict' },
        status: { type: 'select', options: ['invited', 'confirmed', 'checked_in'] as const },
      },
    },
    note: {
      plural: 'notes',
      attributes: {
        checkin: { type: 'ref', object: 'checkin', onDelete: 'set_null' },
        text: { type: 'text', required: true },
      },
    },
  },
})

let mf: Miniflare
let d1: D1Database

async function getDB(): Promise<D1Database> {
  if (!mf) {
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok") } }',
      d1Databases: { DB: 'test-db' },
    })
    d1 = await mf.getD1Database('DB') as unknown as D1Database
  }
  return d1
}

const ALL_TABLES = [
  'relate_guest', 'relate_event', 'relate_checkin', 'relate_note',
  'relate_relationships', 'relate_activities',
  'relate_lists', 'relate_list_items', 'relate_migrations',
]

async function resetDB() {
  const db = await getDB()
  for (const t of ALL_TABLES) {
    await db.prepare(`DELETE FROM ${t}`).run().catch(() => {})
  }
}

async function createTestDB() {
  const raw = await getDB()
  const adapter = new D1Adapter(raw)
  const events = new EventBus()
  const db = relate({ adapter, schema, events })
  await db.migrate()
  return { db, d1: raw, adapter, events }
}

class TrackingD1Adapter extends D1Adapter {
  commitCalls = 0

  override async commitRecordMutations(mutations: Parameters<D1Adapter['commitRecordMutations']>[0]): Promise<void> {
    this.commitCalls++
    await super.commitRecordMutations(mutations)
  }
}

async function createTrackingTestDB() {
  const raw = await getDB()
  const adapter = new TrackingD1Adapter(raw)
  const events = new EventBus()
  const db = relate({ adapter, schema, events })
  await db.migrate()
  return { db, d1: raw, adapter, events }
}

afterAll(async () => { if (mf) await mf.dispose() })

describe('refs (D1)', () => {
  beforeAll(async () => { await createTestDB() })
  beforeEach(async () => { await resetDB() })

  describe('create and query', () => {
    it('creates records with ref and filters by ref', async () => {
      const { db } = await createTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })

      const c1 = await db.checkin.create({ guest: guest.id, event: event.id, status: 'invited' })
      expect(c1.guest).toBe(guest.id)
      expect(c1.event).toBe(event.id)

      const found = await db.checkin.find({ filter: { guest: guest.id } })
      expect(found).toHaveLength(1)
      expect(found[0].id).toBe(c1.id)
    })

    it('auto-indexes ref columns', async () => {
      const { d1 } = await createTestDB()
      const indexes = await d1.prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='relate_checkin'"
      ).all<{ name: string }>()
      const names = indexes.results.map(r => r.name)
      expect(names).toContain('idx_relate_checkin_guest')
      expect(names).toContain('idx_relate_checkin_event')
    })
  })

  describe('onDelete: cascade', () => {
    it('deletes child records when parent is deleted', async () => {
      const { db } = await createTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      await db.checkin.create({ guest: guest.id, event: event.id, status: 'invited' })
      await db.checkin.create({ guest: guest.id, event: event.id, status: 'confirmed' })

      const before = await db.checkin.find({ filter: { guest: guest.id } })
      expect(before).toHaveLength(2)

      await db.guest.delete(guest.id)

      const after = await db.checkin.find({})
      expect(after).toHaveLength(0)
    })

    it('uses a batched commit for cascading deletes on D1', async () => {
      const { db, adapter } = await createTrackingTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id })
      await db.note.create({ checkin: checkin.id, text: 'Needs follow-up' })

      await db.guest.delete(guest.id)

      expect(adapter.commitCalls).toBe(1)
    })

    it('cascades through multiple levels', async () => {
      const { db } = await createTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id })
      await db.note.create({ checkin: checkin.id, text: 'Nice event' })

      // Delete guest → cascade to checkin → set_null on note
      await db.guest.delete(guest.id)

      expect(await db.checkin.find({})).toHaveLength(0)
      const notes = await db.note.find({})
      expect(notes).toHaveLength(1)
      expect(notes[0].checkin).toBeUndefined() // set_null
    })
  })

  describe('onDelete: restrict', () => {
    it('prevents deletion when restrict ref exists', async () => {
      const { db } = await createTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      await db.checkin.create({ guest: guest.id, event: event.id })

      await expect(db.event.delete(event.id)).rejects.toThrow(RefConstraintError)

      // Event should still exist
      expect(await db.event.get(event.id)).not.toBeNull()
    })
  })

  describe('onDelete: set_null', () => {
    it('sets ref to null when referenced record is deleted', async () => {
      const { db } = await createTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id })
      const note = await db.note.create({ checkin: checkin.id, text: 'Great' })

      // Delete checkin directly (not via cascade) — note.checkin should be set_null
      // First we need to remove restrict on event, so delete checkin directly
      // Actually checkin.event is restrict, so we can't delete event. But we can
      // test set_null by deleting the checkin after removing the restrict constraint.
      // Let's create a scenario with no restrict:
      const checkin2 = await db.checkin.create({ guest: guest.id, event: event.id })
      const note2 = await db.note.create({ checkin: checkin2.id, text: 'Also great' })

      // Delete guest cascades to checkins, which set_nulls notes
      await db.guest.delete(guest.id)

      const notes = await db.note.find({})
      expect(notes).toHaveLength(2)
      for (const n of notes) {
        expect(n.checkin).toBeUndefined() // set_null returns undefined from sqlToValue
      }
    })
  })
})
