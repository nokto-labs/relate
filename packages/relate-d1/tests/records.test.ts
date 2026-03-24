import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Records', () => {
  it('creates a record with an id and timestamps', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'alice@test.com', name: 'Alice', tier: 'vip' })

    expect(person.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(person.email).toBe('alice@test.com')
    expect(person.name).toBe('Alice')
    expect(person.createdAt).toBeInstanceOf(Date)
    expect(person.updatedAt).toBeInstanceOf(Date)
  })

  it('retrieves a record by id with correct types', async () => {
    const { db } = await createD1TestDB()
    const created = await db.person.create({ email: 'get@test.com', name: 'Get' })
    const found = await db.person.get(created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.email).toBe('get@test.com')
    expect(found!.createdAt).toBeInstanceOf(Date)
  })

  it('returns null for non-existent id', async () => {
    const { db } = await createD1TestDB()
    expect(await db.person.get('does-not-exist')).toBeNull()
  })

  it('upsert creates when new', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.upsert({ email: 'new@test.com', name: 'New' })
    expect(person.name).toBe('New')

    const count = await db.person.count()
    expect(count).toBe(1)
  })

  it('upsert merges when existing', async () => {
    const { db } = await createD1TestDB()
    await db.person.upsert({ email: 'merge@test.com', name: 'Bob', tier: 'vip' })
    const updated = await db.person.upsert({ email: 'merge@test.com', name: 'Bobby' })

    expect(updated.name).toBe('Bobby')
    expect(await db.person.count()).toBe(1)
  })

  it('enforces uniqueBy at the database layer for direct adapter writes', async () => {
    const { adapter } = await createD1TestDB()

    await adapter.createRecord('person', { email: 'db-unique@test.com' })
    await expect(adapter.createRecord('person', { email: 'db-unique@test.com' })).rejects.toMatchObject({
      name: 'DuplicateError',
      detail: expect.objectContaining({
        code: 'DUPLICATE_RECORD',
        field: 'email',
      }),
    })
  })

  it('rejects invalid pagination numbers in the adapter', async () => {
    const { db } = await createD1TestDB()

    await expect(db.person.find({ limit: -1 })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'limit' }),
    })
    await expect(db.person.find({ offset: -1 })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'offset' }),
    })
    await expect(db.person.findPage({ limit: -1 })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'limit' }),
    })
  })

  it('updates specific fields without touching others', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'partial@test.com', name: 'Alice', tier: 'vip' })
    const updated = await db.person.update(person.id, { name: 'Alicia' })

    expect(updated.name).toBe('Alicia')
    expect(updated.email).toBe('partial@test.com')
  })

  it('deletes a record', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'delete@test.com' })
    await db.person.delete(person.id)

    expect(await db.person.get(person.id)).toBeNull()
    expect(await db.person.count()).toBe(0)
  })

  it('counts exactly', async () => {
    const { db } = await createD1TestDB()
    expect(await db.deal.count()).toBe(0)

    await db.deal.create({ title: 'A' })
    await db.deal.create({ title: 'B' })
    await db.deal.create({ title: 'C' })

    expect(await db.deal.count()).toBe(3)
  })

  // ─── Edge cases ────────────────────────────────────────────────────

  it('handles null optional fields', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'null@test.com' })
    const found = await db.person.get(person.id)

    expect(found!.email).toBe('null@test.com')
    expect(found!.name).toBeUndefined()
    expect(found!.tier).toBeUndefined()
  })

  it('update with empty object is a no-op', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'empty@test.com', name: 'Before' })
    const updated = await db.person.update(person.id, {})

    expect(updated.name).toBe('Before')
  })

  it('handles special characters in text fields', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: "o'brian@test.com", name: "O'Brian" })
    const found = await db.person.get(person.id)

    expect(found!.name).toBe("O'Brian")
    expect(found!.email).toBe("o'brian@test.com")
  })

  it('handles numeric zero correctly', async () => {
    const { db } = await createD1TestDB()
    const deal = await db.deal.create({ title: 'Free', value: 0 })
    const found = await db.deal.get(deal.id)

    expect(found!.value).toBe(0)
  })
})
