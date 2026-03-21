import { describe, it, expect, vi } from 'vitest'
import { createTestCRM } from './helpers'
import { DuplicateError, ValidationError, NotFoundError } from '../src/errors'

describe('ObjectClient', () => {
  describe('create', () => {
    it('creates a record', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.create({ email: 'alice@test.com' })
      expect(person.id).toBeDefined()
      expect(person.email).toBe('alice@test.com')
    })

    it('validates required fields', async () => {
      const { crm } = createTestCRM()
      await expect(crm.person.create({} as any)).rejects.toThrow(ValidationError)
    })

    it('rejects invalid boolean values', async () => {
      const { crm } = createTestCRM()
      await expect(
        crm.person.create({ email: 'alice@test.com', active: 'false' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects invalid date values', async () => {
      const { crm } = createTestCRM()
      await expect(
        crm.person.create({ email: 'alice@test.com', signedUpAt: 'not-a-date' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects invalid select values', async () => {
      const { crm } = createTestCRM()
      await expect(
        crm.person.create({ email: 'alice@test.com', tier: 'legendary' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects unknown attributes', async () => {
      const { crm } = createTestCRM()
      await expect(
        crm.person.create({ email: 'alice@test.com', nickname: 'Al' } as any)
      ).rejects.toThrow(ValidationError)
    })

    it('rejects duplicates when uniqueBy is set', async () => {
      const { crm } = createTestCRM()
      await crm.person.create({ email: 'alice@test.com' })
      await expect(crm.person.create({ email: 'alice@test.com' })).rejects.toThrow(DuplicateError)
    })

    it('emits person.created event', async () => {
      const { crm, events } = createTestCRM()
      const handler = vi.fn()
      events.on('person.created', handler)

      await crm.person.create({ email: 'alice@test.com' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].record.email).toBe('alice@test.com')
    })
  })

  describe('upsert', () => {
    it('creates when record does not exist', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.upsert({ email: 'bob@test.com', name: 'Bob' })
      expect(person.email).toBe('bob@test.com')
    })

    it('updates when record exists', async () => {
      const { crm } = createTestCRM()
      await crm.person.upsert({ email: 'bob@test.com', name: 'Bob' })
      const updated = await crm.person.upsert({ email: 'bob@test.com', name: 'Bobby' })
      expect(updated.name).toBe('Bobby')
    })

    it('emits created event for new records', async () => {
      const { crm, events } = createTestCRM()
      const created = vi.fn()
      const updated = vi.fn()
      events.on('person.created', created)
      events.on('person.updated', updated)

      await crm.person.upsert({ email: 'new@test.com' })

      expect(created).toHaveBeenCalledTimes(1)
      expect(updated).not.toHaveBeenCalled()
    })

    it('emits updated event for existing records', async () => {
      const { crm, events } = createTestCRM()
      await crm.person.upsert({ email: 'bob@test.com', name: 'Bob' })

      const created = vi.fn()
      const updated = vi.fn()
      events.on('person.created', created)
      events.on('person.updated', updated)

      await crm.person.upsert({ email: 'bob@test.com', name: 'Bobby' })

      expect(updated).toHaveBeenCalledTimes(1)
      expect(created).not.toHaveBeenCalled()
    })

    it('throws if object has no uniqueBy', async () => {
      const { crm } = createTestCRM()
      await expect(crm.deal.upsert({ title: 'Test' } as any)).rejects.toThrow(ValidationError)
    })
  })

  describe('get', () => {
    it('returns record by id', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.create({ email: 'alice@test.com' })
      const found = await crm.person.get(person.id)
      expect(found?.email).toBe('alice@test.com')
    })

    it('returns null for non-existent id', async () => {
      const { crm } = createTestCRM()
      const found = await crm.person.get('nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('delete', () => {
    it('deletes a record', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.create({ email: 'alice@test.com' })
      await crm.person.delete(person.id)
      expect(await crm.person.get(person.id)).toBeNull()
    })

    it('throws 404 for non-existent record', async () => {
      const { crm } = createTestCRM()
      await expect(crm.person.delete('nonexistent')).rejects.toThrow(NotFoundError)
    })

    it('emits person.deleted event', async () => {
      const { crm, events } = createTestCRM()
      const handler = vi.fn()
      events.on('person.deleted', handler)

      const person = await crm.person.create({ email: 'alice@test.com' })
      await crm.person.delete(person.id)

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].id).toBe(person.id)
    })
  })

  describe('update', () => {
    it('updates and emits event with changes', async () => {
      const { crm, events } = createTestCRM()
      const handler = vi.fn()
      events.on('person.updated', handler)

      const person = await crm.person.create({ email: 'alice@test.com', name: 'Alice' })
      await crm.person.update(person.id, { name: 'Alicia' })

      expect(handler).toHaveBeenCalledTimes(1)
      expect(handler.mock.calls[0][0].changes).toEqual({ name: 'Alicia' })
    })

    it('validates partial updates without requiring unchanged required fields', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.create({ email: 'alice@test.com', name: 'Alice' })

      const updated = await crm.person.update(person.id, { active: true })
      expect(updated.active).toBe(true)
    })

    it('rejects invalid values on update', async () => {
      const { crm } = createTestCRM()
      const person = await crm.person.create({ email: 'alice@test.com' })

      await expect(crm.person.update(person.id, { active: 'yes' } as any)).rejects.toThrow(ValidationError)
    })
  })

  describe('hooks receive crm instance', () => {
    it('can chain operations from hooks', async () => {
      const { crm, events } = createTestCRM()

      events.on('person.created', async ({ record, crm: c }: any) => {
        await c.person.update(record.id, { name: 'Hooked' })
      })

      const person = await crm.person.create({ email: 'alice@test.com', name: 'Alice' })
      const updated = await crm.person.get(person.id)

      expect(updated?.name).toBe('Hooked')
    })
  })
})
