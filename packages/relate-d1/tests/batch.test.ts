import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('db.batch (D1)', () => {
  it('creates related records in one atomic batch', async () => {
    const { db } = await createD1TestDB()

    const result = await db.batch((b) => {
      const price = b.price.create({ name: 'VIP', amountCents: 3200 })
      const ticket = b.ticket.create({ price: price.id, paymentStatus: 'confirmed' })
      return { priceId: price.id, ticketId: ticket.id }
    })

    expect(await db.price.get(result.priceId)).toMatchObject({ name: 'VIP', amountCents: 3200 })
    expect(await db.ticket.get(result.ticketId)).toMatchObject({ price: result.priceId, paymentStatus: 'confirmed' })
  })

  it('supports mixed create/update batches', async () => {
    const { db } = await createD1TestDB()
    const company = await db.company.create({ domain: 'acme.test', name: 'Acme' })

    const result = await db.batch((b) => {
      b.company.update(company.id, { name: 'Acme HQ' })
      const person = b.person.create({ email: 'alice@test.com', name: 'Alice' })
      return { personId: person.id }
    })

    expect(await db.company.get(company.id)).toMatchObject({ name: 'Acme HQ' })
    expect(await db.person.get(result.personId)).toMatchObject({ email: 'alice@test.com', name: 'Alice' })
  })

  it('fires hooks after commit with committed state available', async () => {
    const { db, events } = await createD1TestDB()
    const handler = vi.fn(async ({ record, db: instance }: any) => {
      return instance.person.get(record.id)
    })
    events.on('person.created', handler)

    const result = await db.batch((b) => {
      const person = b.person.create({ email: 'alice@test.com', name: 'Alice' })
      return { personId: person.id }
    })

    expect(handler).toHaveBeenCalledTimes(1)
    await expect(handler.mock.results[0]?.value).resolves.toMatchObject({ id: result.personId })
  })

  it('rolls back the whole batch when one write fails', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'existing@test.com', name: 'Existing' })

    await expect(
      db.batch((b) => {
        b.person.create({ email: 'fresh@test.com', name: 'Fresh' })
        b.person.create({ email: 'existing@test.com', name: 'Duplicate' })
      }),
    ).rejects.toMatchObject({
      name: 'DuplicateError',
      detail: expect.objectContaining({
        code: 'DUPLICATE_RECORD',
        field: 'email',
      }),
    })

    expect(await db.person.count()).toBe(1)
    expect(await db.person.find({ filter: { email: 'fresh@test.com' } })).toHaveLength(0)
  })
})
