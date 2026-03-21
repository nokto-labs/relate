import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestCRM, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Records', () => {
  it('creates a record with an id and timestamps', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'alice@test.com', name: 'Alice', tier: 'vip' })

    expect(person.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(person.email).toBe('alice@test.com')
    expect(person.name).toBe('Alice')
    expect(person.createdAt).toBeInstanceOf(Date)
    expect(person.updatedAt).toBeInstanceOf(Date)
  })

  it('retrieves a record by id with correct types', async () => {
    const { crm } = await createD1TestCRM()
    const created = await crm.person.create({ email: 'get@test.com', name: 'Get' })
    const found = await crm.person.get(created.id)

    expect(found).not.toBeNull()
    expect(found!.id).toBe(created.id)
    expect(found!.email).toBe('get@test.com')
    expect(found!.createdAt).toBeInstanceOf(Date)
  })

  it('returns null for non-existent id', async () => {
    const { crm } = await createD1TestCRM()
    expect(await crm.person.get('does-not-exist')).toBeNull()
  })

  it('upsert creates when new', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.upsert({ email: 'new@test.com', name: 'New' })
    expect(person.name).toBe('New')

    const count = await crm.person.count()
    expect(count).toBe(1)
  })

  it('upsert merges when existing', async () => {
    const { crm } = await createD1TestCRM()
    await crm.person.upsert({ email: 'merge@test.com', name: 'Bob', tier: 'vip' })
    const updated = await crm.person.upsert({ email: 'merge@test.com', name: 'Bobby' })

    expect(updated.name).toBe('Bobby')
    expect(await crm.person.count()).toBe(1)
  })

  it('updates specific fields without touching others', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'partial@test.com', name: 'Alice', tier: 'vip' })
    const updated = await crm.person.update(person.id, { name: 'Alicia' })

    expect(updated.name).toBe('Alicia')
    expect(updated.email).toBe('partial@test.com')
  })

  it('deletes a record', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'delete@test.com' })
    await crm.person.delete(person.id)

    expect(await crm.person.get(person.id)).toBeNull()
    expect(await crm.person.count()).toBe(0)
  })

  it('counts exactly', async () => {
    const { crm } = await createD1TestCRM()
    expect(await crm.deal.count()).toBe(0)

    await crm.deal.create({ title: 'A' })
    await crm.deal.create({ title: 'B' })
    await crm.deal.create({ title: 'C' })

    expect(await crm.deal.count()).toBe(3)
  })

  // ─── Edge cases ────────────────────────────────────────────────────

  it('handles null optional fields', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'null@test.com' })
    const found = await crm.person.get(person.id)

    expect(found!.email).toBe('null@test.com')
    expect(found!.name).toBeUndefined()
    expect(found!.tier).toBeUndefined()
  })

  it('update with empty object is a no-op', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'empty@test.com', name: 'Before' })
    const updated = await crm.person.update(person.id, {})

    expect(updated.name).toBe('Before')
  })

  it('handles special characters in text fields', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: "o'brian@test.com", name: "O'Brian" })
    const found = await crm.person.get(person.id)

    expect(found!.name).toBe("O'Brian")
    expect(found!.email).toBe("o'brian@test.com")
  })

  it('handles numeric zero correctly', async () => {
    const { crm } = await createD1TestCRM()
    const deal = await crm.deal.create({ title: 'Free', value: 0 })
    const found = await crm.deal.get(deal.id)

    expect(found!.value).toBe(0)
  })
})
