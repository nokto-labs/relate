import { describe, it, expect, vi } from 'vitest'
import { relate, defineSchema, EventBus } from '../src'
import { InvalidSchemaError, RefNotFoundError } from '../src/errors'
import { createMockAdapter } from './helpers'

const refSchema = defineSchema({
  objects: {
    guest: {
      attributes: {
        name: { type: 'text', required: true },
      },
    },
    event: {
      attributes: {
        title: { type: 'text', required: true },
      },
    },
    checkin: {
      attributes: {
        guest: { type: 'ref', object: 'guest', required: true, onDelete: 'cascade' },
        event: { type: 'ref', object: 'event', required: true, onDelete: 'cascade' },
        status: { type: 'select', options: ['invited', 'confirmed'] as const },
      },
    },
    note: {
      attributes: {
        checkin: { type: 'ref', object: 'checkin', onDelete: 'set_null' },
        text: { type: 'text', required: true },
      },
    },
  },
})

function createRefTestDB() {
  const adapter = createMockAdapter()
  const events = new EventBus()
  const db = relate({ adapter, schema: refSchema, events })
  return { db, adapter, events }
}

describe('refs', () => {
  describe('schema validation', () => {
    it('throws on ref to nonexistent object', () => {
      expect(() =>
        relate({
          adapter: createMockAdapter(),
          schema: defineSchema({
            objects: {
              checkin: {
                attributes: {
                  guest: { type: 'ref', object: 'guest', required: true },
                },
              },
            },
          }),
        }),
      ).toThrow(InvalidSchemaError)
    })

    it('throws on set_null + required', () => {
      expect(() =>
        relate({
          adapter: createMockAdapter(),
          schema: defineSchema({
            objects: {
              guest: { attributes: { name: 'text' } },
              checkin: {
                attributes: {
                  guest: { type: 'ref', object: 'guest', required: true, onDelete: 'set_null' },
                },
              },
            },
          }),
        }),
      ).toThrow(InvalidSchemaError)
    })

    it('accepts valid ref schema', () => {
      expect(() => createRefTestDB()).not.toThrow()
    })
  })

  describe('create with ref validation', () => {
    it('rejects ref to nonexistent record', async () => {
      const { db } = createRefTestDB()
      await db.event.create({ title: 'Conf' })

      await expect(
        db.checkin.create({ guest: 'nonexistent', event: 'nonexistent', status: 'invited' }),
      ).rejects.toThrow(RefNotFoundError)
    })

    it('creates record with valid refs', async () => {
      const { db } = createRefTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })

      const checkin = await db.checkin.create({ guest: guest.id, event: event.id, status: 'invited' })
      expect(checkin.guest).toBe(guest.id)
      expect(checkin.event).toBe(event.id)
    })

    it('rejects non-string ref value', async () => {
      const { db } = createRefTestDB()
      await expect(
        db.checkin.create({ guest: 123 as any, event: 'x', status: 'invited' }),
      ).rejects.toThrow()
    })
  })

  describe('update with ref validation', () => {
    it('rejects ref to nonexistent record on update', async () => {
      const { db } = createRefTestDB()
      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id })

      await expect(
        db.checkin.update(checkin.id, { guest: 'nonexistent' }),
      ).rejects.toThrow(RefNotFoundError)
    })
  })

  describe('events', () => {
    it('emits child updated/deleted events for cascading ref actions', async () => {
      const { db, events } = createRefTestDB()
      const checkinDeleted = vi.fn()
      const noteUpdated = vi.fn()
      events.on('checkin.deleted', checkinDeleted)
      events.on('note.updated', noteUpdated)

      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id, status: 'invited' })
      const note = await db.note.create({ checkin: checkin.id, text: 'Ready' })

      await db.guest.delete(guest.id)

      expect(checkinDeleted).toHaveBeenCalledTimes(1)
      expect(checkinDeleted).toHaveBeenCalledWith(expect.objectContaining({ id: checkin.id }))
      expect(noteUpdated).toHaveBeenCalledTimes(1)
      expect(noteUpdated).toHaveBeenCalledWith(expect.objectContaining({
        record: expect.objectContaining({ id: note.id, checkin: null }),
        changes: { checkin: null },
      }))
    })

    it('does not emit events or mutate records when an atomic commit fails', async () => {
      const adapter = {
        ...createMockAdapter(),
        commitRecordMutations: vi.fn().mockRejectedValue(new Error('atomic failure')),
      }
      const events = new EventBus()
      const db = relate({ adapter: adapter as any, schema: refSchema, events })
      const guestDeleted = vi.fn()
      const checkinDeleted = vi.fn()
      const noteUpdated = vi.fn()
      events.on('guest.deleted', guestDeleted)
      events.on('checkin.deleted', checkinDeleted)
      events.on('note.updated', noteUpdated)

      const guest = await db.guest.create({ name: 'Alice' })
      const event = await db.event.create({ title: 'Conf' })
      const checkin = await db.checkin.create({ guest: guest.id, event: event.id, status: 'invited' })
      const note = await db.note.create({ checkin: checkin.id, text: 'Ready' })

      await expect(db.guest.delete(guest.id)).rejects.toThrow('atomic failure')

      expect(adapter.commitRecordMutations).toHaveBeenCalledTimes(1)
      expect(await db.guest.get(guest.id)).not.toBeNull()
      expect(await db.checkin.get(checkin.id)).not.toBeNull()
      expect((await db.note.get(note.id))?.checkin).toBe(checkin.id)
      expect(guestDeleted).not.toHaveBeenCalled()
      expect(checkinDeleted).not.toHaveBeenCalled()
      expect(noteUpdated).not.toHaveBeenCalled()
    })
  })
})
