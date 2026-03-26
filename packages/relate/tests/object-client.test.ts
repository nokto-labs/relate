import { describe, it, expect, vi } from 'vitest'
import { createTestDB, createMockAdapter } from './helpers'
import { relate, defineSchema } from '../src'
import { DuplicateError, ValidationError, NotFoundError } from '../src/errors'

describe('ObjectClient', () => {
  describe('create', () => {
    it('creates a record', async () => {
      const { db } = createTestDB()
      const person = await db.person.create({ email: 'alice@test.com' })
      expect(person.id).toBeDefined()
      expect(person.email).toBe('alice@test.com')
    })

    it('validates required fields', async () => {
      const { db } = createTestDB()
      await expect(db.person.create({} as any)).rejects.toThrow(ValidationError)
    })

    it('rejects invalid boolean values', async () => {
      const { db } = createTestDB()
      await expect(
        db.person.create({ email: 'alice@test.com', active: 'false' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects invalid date values', async () => {
      const { db } = createTestDB()
      await expect(
        db.person.create({ email: 'alice@test.com', signedUpAt: 'not-a-date' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects invalid select values', async () => {
      const { db } = createTestDB()
      await expect(
        db.person.create({ email: 'alice@test.com', tier: 'legendary' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects unknown attributes', async () => {
      const { db } = createTestDB()
      await expect(
        db.person.create({ email: 'alice@test.com', nickname: 'Al' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects duplicates when uniqueBy is set', async () => {
      const { db } = createTestDB()
      await db.person.create({ email: 'alice@test.com' })
      await expect(db.person.create({ email: 'alice@test.com' })).rejects.toThrow(DuplicateError)
    })

    it('emits person.created event', async () => {
      const { db, events } = createTestDB()
      const handler = vi.fn()
      events.on('person.created', handler)

      await db.person.create({ email: 'alice@test.com' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].record.email).toBe('alice@test.com')
    })

    it('uses a custom id generator when configured', async () => {
      let counter = 0
      const db = relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            event: {
              attributes: { title: 'text' },
              id: () => `custom${++counter}`,
            },
          },
        }),
      })

      const a = await db.event.create({ title: 'First' })
      const b = await db.event.create({ title: 'Second' })
      expect(a.id).toBe('custom1')
      expect(b.id).toBe('custom2')
    })

    it('prepends idPrefix to generated IDs', async () => {
      const db = relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            event: {
              attributes: { title: 'text' },
              idPrefix: 'evt',
            },
          },
        }),
      })

      const event = await db.event.create({ title: 'Launch' })
      expect(event.id).toMatch(/^evt_/)
    })

    it('combines idPrefix with a custom id generator', async () => {
      const db = relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            event: {
              attributes: { title: 'text' },
              idPrefix: 'evt',
              id: () => 'abc123',
            },
          },
        }),
      })

      const event = await db.event.create({ title: 'Launch' })
      expect(event.id).toBe('evt_abc123')
    })
  })

  describe('upsert', () => {
    it('creates when record does not exist', async () => {
      const { db } = createTestDB()
      const person = await db.person.upsert({ email: 'bob@test.com', name: 'Bob' })
      expect(person.email).toBe('bob@test.com')
    })

    it('updates when record exists', async () => {
      const { db } = createTestDB()
      await db.person.upsert({ email: 'bob@test.com', name: 'Bob' })
      const updated = await db.person.upsert({ email: 'bob@test.com', name: 'Bobby' })
      expect(updated.name).toBe('Bobby')
    })

    it('emits created event for new records', async () => {
      const { db, events } = createTestDB()
      const created = vi.fn()
      const updated = vi.fn()
      events.on('person.created', created)
      events.on('person.updated', updated)

      await db.person.upsert({ email: 'new@test.com' })

      expect(created).toHaveBeenCalledTimes(1)
      expect(updated).not.toHaveBeenCalled()
    })

    it('emits updated event for existing records', async () => {
      const { db, events } = createTestDB()
      await db.person.upsert({ email: 'bob@test.com', name: 'Bob' })

      const created = vi.fn()
      const updated = vi.fn()
      events.on('person.created', created)
      events.on('person.updated', updated)

      await db.person.upsert({ email: 'bob@test.com', name: 'Bobby' })

      expect(updated).toHaveBeenCalledTimes(1)
      expect(created).not.toHaveBeenCalled()
    })

    it('throws if object has no uniqueBy', async () => {
      const { db } = createTestDB()
      await expect(db.deal.upsert({ title: 'Test' } as any)).rejects.toThrow(ValidationError)
    })
  })

  describe('get', () => {
    it('returns record by id', async () => {
      const { db } = createTestDB()
      const person = await db.person.create({ email: 'alice@test.com' })
      const found = await db.person.get(person.id)
      expect(found?.email).toBe('alice@test.com')
    })

    it('returns null for non-existent id', async () => {
      const { db } = createTestDB()
      const found = await db.person.get('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes a record', async () => {
      const { db } = createTestDB()
      const person = await db.person.create({ email: 'alice@test.com' })
      await db.person.delete(person.id)
      expect(await db.person.get(person.id)).toBeNull()
    })

    it('throws 404 for non-existent record', async () => {
      const { db } = createTestDB()
      await expect(db.person.delete('nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('emits person.deleted event', async () => {
      const { db, events } = createTestDB()
      const handler = vi.fn()
      events.on('person.deleted', handler)

      const person = await db.person.create({ email: 'alice@test.com' })
      await db.person.delete(person.id)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].id).toBe(person.id)
    })
  })

  describe('update', () => {
    it('updates and emits event with changes', async () => {
      const { db, events } = createTestDB()
      const handler = vi.fn()
      events.on('person.updated', handler)

      const person = await db.person.create({ email: 'alice@test.com', name: 'Alice' })
      await db.person.update(person.id, { name: 'Alicia' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].changes).toEqual({ name: 'Alicia' })
    })

    it('validates partial updates without requiring unchanged required fields', async () => {
      const { db } = createTestDB()
      const person = await db.person.create({ email: 'alice@test.com', name: 'Alice' })

      const updated = await db.person.update(person.id, { active: true })
      expect(updated.active).toBe(true)
    })

    it('rejects invalid values on update', async () => {
      const { db } = createTestDB()
      const person = await db.person.create({ email: 'alice@test.com' })

      await expect(db.person.update(person.id, { active: 'yes' } as any)).rejects.toThrow(ValidationError)
    })
  })

  describe('hooks receive db instance', () => {
    it('can chain operations from hooks', async () => {
      const { db, events } = createTestDB()

      events.on('person.created', async ({ record, db: instance }: any) => {
        await instance.person.update(record.id, { name: 'Hooked' })
      })

      const person = await db.person.create({ email: 'alice@test.com', name: 'Alice' })
      const updated = await db.person.get(person.id)

      expect(updated?.name).toBe('Hooked')
    })
  })

  describe('aggregate', () => {
    it('supports null filters in the JavaScript aggregate fallback', async () => {
      const { db } = createTestDB()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await db.deal.create({ title: 'Missing value' })
      await db.deal.create({ title: 'Has value', value: 250 })

      expect(await db.deal.aggregate({ filter: { value: { eq: null } }, count: true })).toEqual({
        count: 1,
      })

      warn.mockRestore()
    })

    it('falls back to JavaScript aggregates and warns', async () => {
      const { db } = createTestDB()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await db.deal.create({ title: 'A', value: 100 })
      await db.deal.create({ title: 'B', value: 250 })

      expect(await db.deal.aggregate({ count: true, sum: { field: 'value' } })).toEqual({
        count: 2,
        sum: 350,
      })

      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0][0]).toContain('Falling back to JavaScript aggregate')
      warn.mockRestore()
    })

    it('supports groupBy together with sum in the JavaScript fallback for direct fields', async () => {
      const { db } = createTestDB()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await db.deal.create({ title: 'A', stage: 'won', value: 100 })
      await db.deal.create({ title: 'B', stage: 'won', value: 250 })
      await db.deal.create({ title: 'C', stage: 'lead', value: 80 })

      expect(await db.deal.aggregate({ count: true, groupBy: 'stage', sum: { field: 'value' } })).toEqual({
        groups: {
          won: 2,
          lead: 1,
        },
        groupSums: {
          won: 350,
          lead: 80,
        },
      })

      expect(warn).toHaveBeenCalledTimes(1)
      warn.mockRestore()
    })

    it('groups counts by field', async () => {
      const { db } = createTestDB()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      await db.person.create({ email: 'vip-1@test.com', tier: 'vip' })
      await db.person.create({ email: 'vip-2@test.com', tier: 'vip' })
      await db.person.create({ email: 'trial@test.com', tier: 'trial' })

      expect(await db.person.aggregate({ count: true, groupBy: 'tier' })).toEqual({
        groups: {
          vip: 2,
          trial: 1,
        },
      })

      warn.mockRestore()
    })

    it('rejects ref-aware sums without native adapter aggregate support', async () => {
      const { db } = createTestDB()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const basic = await db.price.create({ name: 'Basic', amountCents: 1200 })
      await db.ticket.create({ price: basic.id, paymentStatus: 'confirmed' })

      await expect(
        db.ticket.aggregate({
          filter: { paymentStatus: 'confirmed' },
          sum: { field: 'price.amountCents' },
        }),
      ).rejects.toThrow(ValidationError)

      expect(warn).not.toHaveBeenCalled()
      warn.mockRestore()
    })
  })

})
