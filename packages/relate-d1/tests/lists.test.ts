import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestCRM, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Lists', () => {
  describe('static', () => {
    it('creates, adds items, and retrieves them', async () => {
      const { crm } = await createD1TestCRM()
      const a = await crm.person.create({ email: 'a@test.com', name: 'A' })
      const b = await crm.person.create({ email: 'b@test.com', name: 'B' })

      const list = await crm.lists.create({ name: 'VIPs', object: 'person', type: 'static' })
      await crm.lists.addTo(list.id, [a.id, b.id])

      const items = await crm.lists.items(list.id)
      expect(items.records).toHaveLength(2)

      const ids = items.records.map((r) => r.id)
      expect(ids).toContain(a.id)
      expect(ids).toContain(b.id)
    })

    it('removes items', async () => {
      const { crm } = await createD1TestCRM()
      const person = await crm.person.create({ email: 'rm@test.com' })
      const list = await crm.lists.create({ name: 'Temp', object: 'person', type: 'static' })

      await crm.lists.addTo(list.id, [person.id])
      expect(await crm.lists.count(list.id)).toBe(1)

      await crm.lists.removeFrom(list.id, [person.id])
      expect(await crm.lists.count(list.id)).toBe(0)
    })

    it('ignores duplicate adds', async () => {
      const { crm } = await createD1TestCRM()
      const person = await crm.person.create({ email: 'dup@test.com' })
      const list = await crm.lists.create({ name: 'NoDup', object: 'person', type: 'static' })

      await crm.lists.addTo(list.id, [person.id])
      await crm.lists.addTo(list.id, [person.id]) // second add

      expect(await crm.lists.count(list.id)).toBe(1)
    })

    it('cascade: deleting a record removes it from lists', async () => {
      const { crm } = await createD1TestCRM()
      const person = await crm.person.create({ email: 'cascade@test.com' })
      const list = await crm.lists.create({ name: 'Cascade', object: 'person', type: 'static' })
      await crm.lists.addTo(list.id, [person.id])

      await crm.person.delete(person.id)

      expect(await crm.lists.count(list.id)).toBe(0)
    })
  })

  describe('dynamic', () => {
    it('resolves items from filter', async () => {
      const { crm } = await createD1TestCRM()
      await crm.deal.create({ title: 'Big', value: 50_000, stage: 'lead' })
      await crm.deal.create({ title: 'Small', value: 10, stage: 'lead' })

      const list = await crm.lists.create({
        name: 'Big deals',
        object: 'deal',
        type: 'dynamic',
        filter: { value: { gte: 1000 } },
      })

      const items = await crm.lists.items(list.id)
      expect(items.records).toHaveLength(1)
      expect((items.records[0] as any).title).toBe('Big')
    })

    it('count matches filter', async () => {
      const { crm } = await createD1TestCRM()
      await crm.deal.create({ title: 'A', stage: 'won', value: 100 })
      await crm.deal.create({ title: 'B', stage: 'won', value: 200 })
      await crm.deal.create({ title: 'C', stage: 'lead', value: 300 })

      const list = await crm.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      expect(await crm.lists.count(list.id)).toBe(2)
    })

    it('updates reflect in items immediately', async () => {
      const { crm } = await createD1TestCRM()
      const deal = await crm.deal.create({ title: 'Moving', stage: 'lead', value: 5000 })

      const list = await crm.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      expect(await crm.lists.count(list.id)).toBe(0)

      await crm.deal.update(deal.id, { stage: 'won' })

      expect(await crm.lists.count(list.id)).toBe(1)
    })

    it('rejects invalid filter keys when updating a dynamic list', async () => {
      const { crm } = await createD1TestCRM()
      const list = await crm.lists.create({
        name: 'Won',
        object: 'deal',
        type: 'dynamic',
        filter: { stage: 'won' },
      })

      await expect(
        crm.lists.update(list.id, { filter: { nonexistent: 'x' } as any })
      ).rejects.toThrow(/Invalid filter keys/)
    })
  })

  describe('CRUD', () => {
    it('gets by id', async () => {
      const { crm } = await createD1TestCRM()
      const list = await crm.lists.create({ name: 'Find', object: 'person', type: 'static' })
      const found = await crm.lists.get(list.id)

      expect(found).not.toBeNull()
      expect(found!.name).toBe('Find')
      expect(found!.type).toBe('static')
      expect(found!.object).toBe('person')
    })

    it('returns null for non-existent list', async () => {
      const { crm } = await createD1TestCRM()
      expect(await crm.lists.get('nonexistent')).toBeNull()
    })

    it('updates name', async () => {
      const { crm } = await createD1TestCRM()
      const list = await crm.lists.create({ name: 'Old', object: 'person', type: 'static' })
      const updated = await crm.lists.update(list.id, { name: 'New' })
      expect(updated.name).toBe('New')
    })

    it('deletes list and its items', async () => {
      const { crm } = await createD1TestCRM()
      const person = await crm.person.create({ email: 'delist@test.com' })
      const list = await crm.lists.create({ name: 'Gone', object: 'person', type: 'static' })
      await crm.lists.addTo(list.id, [person.id])

      await crm.lists.delete(list.id)

      expect(await crm.lists.get(list.id)).toBeNull()
    })
  })
})
