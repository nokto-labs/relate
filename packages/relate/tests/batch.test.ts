import { describe, it, expect, vi } from 'vitest'
import { EventBus, relate, defineSchema } from '../src'
import { DuplicateError, RefNotFoundError } from '../src/errors'
import { createMockAdapter, createTestDB } from './helpers'

describe('db.batch', () => {
  it('creates related records atomically and returns the callback result', async () => {
    const { db } = createTestDB()

    const result = await db.batch((b) => {
      const price = b.price.create({ name: 'VIP', amountCents: 2500 })
      const ticket = b.ticket.create({ price: price.id, paymentStatus: 'confirmed' })
      return { priceId: price.id, ticketId: ticket.id }
    })

    expect(result.priceId).toBeDefined()
    expect(result.ticketId).toBeDefined()
    expect(await db.price.get(result.priceId)).toMatchObject({ name: 'VIP', amountCents: 2500 })
    expect(await db.ticket.get(result.ticketId)).toMatchObject({ price: result.priceId, paymentStatus: 'confirmed' })
  })

  it('emits hooks only after the batch commits successfully', async () => {
    const { adapter } = createTestDB()
    const events = new EventBus()
    const db = relate({
      adapter,
      schema: defineSchema({
        objects: {
          person: {
            attributes: {
              email: { type: 'email', required: true },
              name: 'text',
            },
            uniqueBy: 'email',
          },
        },
      }),
      events,
    })

    const seen: string[] = []
    events.on('person.created', async ({ record, db: instance }: any) => {
      seen.push(`hook:${record.email}:${String(Boolean(await instance.person.get(record.id)))}`)
    })

    await db.batch((b) => {
      b.person.create({ email: 'alice@test.com', name: 'Alice' })
    })

    expect(seen).toEqual(['hook:alice@test.com:true'])
  })

  it('supports batching updates against records created earlier in the same batch', async () => {
    const { db, events } = createTestDB()
    const created = vi.fn()
    const updated = vi.fn()
    events.on('person.created', created)
    events.on('person.updated', updated)

    const result = await db.batch((b) => {
      const person = b.person.create({ email: 'alice@test.com', name: 'Alice' })
      b.person.update(person.id, { name: 'Alicia' })
      return { id: person.id }
    })

    expect(await db.person.get(result.id)).toMatchObject({ email: 'alice@test.com', name: 'Alicia' })
    expect(created).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ id: result.id, name: 'Alice' }),
    }))
    expect(updated).toHaveBeenCalledWith(expect.objectContaining({
      record: expect.objectContaining({ id: result.id, name: 'Alicia' }),
      changes: { name: 'Alicia' },
    }))
  })

  it('assigns one shared timestamp to all writes in the batch', async () => {
    const { db } = createTestDB()

    const result = await db.batch((b) => {
      const first = b.person.create({ email: 'alice@test.com' })
      const second = b.person.create({ email: 'bob@test.com' })
      return { firstId: first.id, secondId: second.id }
    })

    const first = await db.person.get(result.firstId)
    const second = await db.person.get(result.secondId)

    expect(first?.createdAt.getTime()).toBeDefined()
    expect(first?.createdAt.getTime()).toBe(second?.createdAt.getTime())
    expect(first?.updatedAt.getTime()).toBe(second?.updatedAt.getTime())
  })

  it('rejects async callbacks', async () => {
    const { db } = createTestDB()

    await expect(
      db.batch(async (b) => {
        b.person.create({ email: 'alice@test.com' })
      }),
    ).rejects.toThrow('db.batch() callback must be synchronous')
  })

  it('rejects refs that are still missing after batch planning', async () => {
    const { db } = createTestDB()

    await expect(
      db.batch((b) => {
        b.ticket.create({ price: 'missing-price', paymentStatus: 'confirmed' })
      }),
    ).rejects.toThrow(RefNotFoundError)
  })

  it('throws when the adapter does not support atomic batch writes', async () => {
    const events = new EventBus()
    const adapter = createMockAdapter()
    delete (adapter as Partial<typeof adapter>).commitRecordMutations

    const db = relate({
      adapter,
      schema: defineSchema({
        objects: {
          person: {
            attributes: {
              email: { type: 'email', required: true },
            },
          },
        },
      }),
      events,
    })

    await expect(
      db.batch((b) => {
        b.person.create({ email: 'alice@test.com' })
      }),
    ).rejects.toThrow('This adapter does not support batch writes')
  })

  it('does not emit hooks or persist records when the atomic commit fails', async () => {
    const adapter = {
      ...createMockAdapter(),
      commitRecordMutations: vi.fn().mockRejectedValue(new Error('atomic failure')),
    }
    const events = new EventBus()
    const db = relate({
      adapter: adapter as any,
      schema: defineSchema({
        objects: {
          person: {
            attributes: {
              email: { type: 'email', required: true },
            },
            uniqueBy: 'email',
          },
        },
      }),
      events,
    })

    const created = vi.fn()
    events.on('person.created', created)

    await expect(
      db.batch((b) => {
        b.person.create({ email: 'alice@test.com' })
      }),
    ).rejects.toThrow('atomic failure')

    expect(created).not.toHaveBeenCalled()
    expect(await db.person.find()).toEqual([])
  })

  it('surfaces duplicate errors without partially applying the batch', async () => {
    const { db } = createTestDB()
    await db.person.create({ email: 'existing@test.com' })

    await expect(
      db.batch((b) => {
        b.person.create({ email: 'new@test.com' })
        b.person.create({ email: 'existing@test.com' })
      }),
    ).rejects.toThrow(DuplicateError)

    const records = await db.person.find()
    expect(records.map((record) => record.email).sort()).toEqual(['existing@test.com'])
  })
})
