import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Lists', () => {
  describe('static', () => {
    it('creates, adds items, and retrieves them', async () => {
      const { db } = await createD1TestDB()
      const a = await db.person.create({ email: 'a@test.com', name: 'A' })
      const b = await db.person.create({ email: 'b@test.com', name: 'B' })

      const list = await db.lists.create({ name: 'VIPs', object: 'person', type: 'static' })
      await db.lists.addTo(list.id, [a.id, b.id])

      const items = await db.lists.items(list.id)
      expect(items.records).toHaveLength(2)

      const ids = items.records.map((r) => r.id)
      expect(ids).toContain(a.id)
      expect(ids).toContain(b.id)
    })

    it('removes items', async () => {
      const { db } = await createD1TestDB()
      const person = await db.person.create({ email: 'rm@test.com' })
      const list = await db.lists.create({ name: 'Temp', object: 'person', type: 'static' })

      await db.lists.addTo(list.id, [person.id])
      expect(await db.lists.count(list.id)).toBe(1)

      await db.lists.removeFrom(list.id, [person.id])
      expect(await db.lists.count(list.id)).toBe(0)
    })

    it('ignores duplicate adds', async () => {
      const { db } = await createD1TestDB()
      const person = await db.person.create({ email: 'dup@test.com' })
      const list = await db.lists.create({ name: 'NoDup', object: 'person', type: 'static' })

      await db.lists.addTo(list.id, [person.id])
      await db.lists.addTo(list.id, [person.id]) // second add

      expect(await db.lists.count(list.id)).toBe(1)
    })

    it('cascade: deleting a record removes it from lists', async () => {
      const { db } = await createD1TestDB()
      const person = await db.person.create({ email: 'cascade@test.com' })
      const list = await db.lists.create({ name: 'Cascade', object: 'person', type: 'static' })
      await db.lists.addTo(list.id, [person.id])

      await db.person.delete(person.id)

      expect(await db.lists.count(list.id)).toBe(0)
    })
  })

  describe('dynamic', () => {
    it('resolves items from filter', async () => {
      const { db } = await createD1TestDB()
      await db.deal.create({ title: 'Big', value: 50_000, stage: 'lead' })
      await db.deal.create({ title: 'Small', value: 10, stage: 'lead' })

      const list = await db.lists.create({
        name: 'Big deals',
        object: 'deal',
        type: 'dynamic',
        filter: { value: { gte: 1000 } },
      })

      const items = await db.lists.items(list.id)
      expect(items.records).toHaveLength(1)
      expect((items.records[0] as any).title).toBe('Big')
    })

    it('count matches filter', async () => {
      const { db } = await createD1TestDB()
      await db.deal.create({ title: 'A', stage: 'won', value: 100 })
      await db.deal.create({ title: 'B', stage: 'won', value: 200 })
      await db.deal.create({ title: 'C', stage: 'lead', value: 300 })

      const list = await db.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      expect(await db.lists.count(list.id)).toBe(2)
    })

    it('updates reflect in items immediately', async () => {
      const { db } = await createD1TestDB()
      const deal = await db.deal.create({ title: 'Moving', stage: 'lead', value: 5000 })

      const list = await db.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      expect(await db.lists.count(list.id)).toBe(0)

      await db.deal.update(deal.id, { stage: 'won' })

      expect(await db.lists.count(list.id)).toBe(1)
    })

    it('rejects invalid filter keys when updating a dynamic list', async () => {
      const { db } = await createD1TestDB()
      const list = await db.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      await expect(
        db.lists.update(list.id, { filter: { nonexistent: 'x' } as any })
      ).rejects.toThrow(/Invalid filter keys/)
    })
  })

  describe('CRUD', () => {
    it('gets by id', async () => {
      const { db } = await createD1TestDB()
      const list = await db.lists.create({ name: 'Find', object: 'person', type: 'static' })
      const found = await db.lists.get(list.id)

      expect(found).not.toBeNull()
      expect(found!.name).toBe('Find')
      expect(found!.type).toBe('static')
      expect(found!.object).toBe('person')
    })

    it('returns null for non-existent list', async () => {
      const { db } = await createD1TestDB()
      expect(await db.lists.get('nonexistent')).toBeNull()
    })

    it('updates name', async () => {
      const { db } = await createD1TestDB()
      const list = await db.lists.create({ name: 'Old', object: 'person', type: 'static' })
      const updated = await db.lists.update(list.id, { name: 'New' })
      expect(updated.name).toBe('New')
    })

    it('deletes list and its items', async () => {
      const { db } = await createD1TestDB()
      const person = await db.person.create({ email: 'delist@test.com' })
      const list = await db.lists.create({ name: 'Gone', object: 'person', type: 'static' })
      await db.lists.addTo(list.id, [person.id])

      await db.lists.delete(list.id)

      expect(await db.lists.get(list.id)).toBeNull()
    })
  })
})
