import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Queries', () => {
  // ─── Filtering ─────────────────────────────────────────────────────

  it('filters by equality', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'Won', stage: 'won', value: 100 })
    await db.deal.create({ title: 'Lead', stage: 'lead', value: 50 })

    const won = await db.deal.find({ filter: { stage: 'won' } })
    expect(won).toHaveLength(1)
    expect((won[0] as any).title).toBe('Won')
  })

  it('filters with gt/lt operators', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'Small', value: 10 })
    await db.deal.create({ title: 'Medium', value: 500 })
    await db.deal.create({ title: 'Big', value: 5000 })

    const results = await db.deal.find({ filter: { value: { gt: 100, lt: 1000 } } })
    expect(results).toHaveLength(1)
    expect((results[0] as any).title).toBe('Medium')
  })

  it('filters with gte/lte operators', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', value: 100 })
    await db.deal.create({ title: 'B', value: 200 })
    await db.deal.create({ title: 'C', value: 300 })

    const results = await db.deal.find({ filter: { value: { gte: 100, lte: 200 } } })
    expect(results).toHaveLength(2)
  })

  it('filters with in operator', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'lead' })
    await db.deal.create({ title: 'B', stage: 'won' })
    await db.deal.create({ title: 'C', stage: 'qualified' })

    const results = await db.deal.find({ filter: { stage: { in: ['lead', 'won'] } } })
    expect(results).toHaveLength(2)
    const stages = results.map((r) => (r as any).stage)
    expect(stages).toContain('lead')
    expect(stages).toContain('won')
    expect(stages).not.toContain('qualified')
  })

  it('filters with ne operator', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'won' })
    await db.deal.create({ title: 'B', stage: 'lead' })

    const results = await db.deal.find({ filter: { stage: { ne: 'won' } } })
    expect(results).toHaveLength(1)
    expect((results[0] as any).stage).toBe('lead')
  })

  it('filters null values with direct equality and eq/null operators', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'missing-name@test.com' })
    await db.person.create({ email: 'named@test.com', name: 'Alice' })

    expect(await db.person.find({ filter: { name: null } })).toHaveLength(1)
    expect(await db.person.find({ filter: { name: { eq: null } } })).toHaveLength(1)
    expect(await db.person.find({ filter: { name: { ne: null } } })).toHaveLength(1)
    expect(await db.person.find({ filter: { name: { in: [null, 'Alice'] } } })).toHaveLength(2)
  })

  it('filters with like operator', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'alice@acme.com', name: 'Alice' })
    await db.person.create({ email: 'bob@acme.com', name: 'Bob' })
    await db.person.create({ email: 'alex@acme.com', name: 'Alex' })

    const results = await db.person.find({ filter: { name: { like: 'Al%' } } })
    expect(results).toHaveLength(2)
    const names = results.map((r) => (r as any).name)
    expect(names).toContain('Alice')
    expect(names).toContain('Alex')
  })

  it('counts with filter', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'won' })
    await db.deal.create({ title: 'B', stage: 'won' })
    await db.deal.create({ title: 'C', stage: 'lead' })

    expect(await db.deal.count({ stage: 'won' })).toBe(2)
    expect(await db.deal.count({ stage: 'lead' })).toBe(1)
  })

  it('counts null values with eq/null filters', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'missing-name@test.com' })
    await db.person.create({ email: 'named@test.com', name: 'Alice' })

    expect(await db.person.count({ name: { eq: null } })).toBe(1)
    expect(await db.person.count({ name: { ne: null } })).toBe(1)
  })

  it('filters boolean fields correctly', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'active@test.com', active: true })
    await db.person.create({ email: 'inactive@test.com', active: false })

    const results = await db.person.find({ filter: { active: true } })
    expect(results).toHaveLength(1)
    expect(results[0].email).toBe('active@test.com')
  })

  it('filters date fields correctly', async () => {
    const { db } = await createD1TestDB()
    await db.person.create({ email: 'early@test.com', signedUpAt: new Date('2026-01-01T00:00:00.000Z') })
    await db.person.create({ email: 'late@test.com', signedUpAt: new Date('2026-02-01T00:00:00.000Z') })

    const results = await db.person.find({
      filter: { signedUpAt: { gte: new Date('2026-01-15T00:00:00.000Z') } },
    })

    expect(results).toHaveLength(1)
    expect(results[0].email).toBe('late@test.com')
  })

  it('aggregates count and sum natively without warning', async () => {
    const { db } = await createD1TestDB()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await db.deal.create({ title: 'A', value: 100 })
    await db.deal.create({ title: 'B', value: 250 })

    expect(await db.deal.aggregate({ count: true, sum: { field: 'value' } })).toEqual({
      count: 2,
      sum: 350,
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('aggregates with null filters natively', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'Missing value' })
    await db.deal.create({ title: 'Has value', value: 250 })

    expect(await db.deal.aggregate({ filter: { value: { eq: null } }, count: true })).toEqual({
      count: 1,
    })
  })

  it('aggregates grouped counts natively without warning', async () => {
    const { db } = await createD1TestDB()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await db.deal.create({ title: 'A', stage: 'won' })
    await db.deal.create({ title: 'B', stage: 'won' })
    await db.deal.create({ title: 'C', stage: 'lead' })

    expect(await db.deal.aggregate({ count: true, groupBy: 'stage' })).toEqual({
      groups: {
        lead: 1,
        won: 2,
      },
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('aggregates grouped counts and sums natively without warning', async () => {
    const { db } = await createD1TestDB()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await db.deal.create({ title: 'A', stage: 'won', value: 100 })
    await db.deal.create({ title: 'B', stage: 'won', value: 250 })
    await db.deal.create({ title: 'C', stage: 'lead', value: 80 })

    expect(await db.deal.aggregate({ count: true, groupBy: 'stage', sum: { field: 'value' } })).toEqual({
      groups: {
        lead: 1,
        won: 2,
      },
      groupSums: {
        lead: 80,
        won: 350,
      },
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('aggregates sums across one ref hop natively without warning', async () => {
    const { db } = await createD1TestDB()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const basic = await db.price.create({ name: 'Basic', amountCents: 1200 })
    const vip = await db.price.create({ name: 'VIP', amountCents: 4500 })

    await db.ticket.create({ price: basic.id, paymentStatus: 'confirmed' })
    await db.ticket.create({ price: basic.id, paymentStatus: 'confirmed' })
    await db.ticket.create({ price: vip.id, paymentStatus: 'pending' })

    expect(await db.ticket.aggregate({
      filter: { paymentStatus: 'confirmed' },
      sum: { field: 'price.amountCents' },
    })).toEqual({
      sum: 2400,
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('aggregates grouped sums across one ref hop natively without warning', async () => {
    const { db } = await createD1TestDB()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const basic = await db.price.create({ name: 'Basic', amountCents: 1200 })
    const vip = await db.price.create({ name: 'VIP', amountCents: 4500 })

    await db.ticket.create({ price: basic.id, paymentStatus: 'confirmed' })
    await db.ticket.create({ price: basic.id, paymentStatus: 'confirmed' })
    await db.ticket.create({ price: vip.id, paymentStatus: 'confirmed' })

    expect(await db.ticket.aggregate({
      filter: { paymentStatus: 'confirmed' },
      count: true,
      groupBy: 'price',
      sum: { field: 'price.amountCents' },
    })).toEqual({
      groups: {
        [basic.id]: 2,
        [vip.id]: 1,
      },
      groupSums: {
        [basic.id]: 2400,
        [vip.id]: 4500,
      },
    })

    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  // ─── Ordering ──────────────────────────────────────────────────────

  it('orders ascending', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'C', value: 300 })
    await db.deal.create({ title: 'A', value: 100 })
    await db.deal.create({ title: 'B', value: 200 })

    const results = await db.deal.find({ orderBy: 'value', order: 'asc' })
    const values = results.map((r) => (r as any).value)
    expect(values).toEqual([100, 200, 300])
  })

  it('orders descending', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'C', value: 300 })
    await db.deal.create({ title: 'A', value: 100 })
    await db.deal.create({ title: 'B', value: 200 })

    const results = await db.deal.find({ orderBy: 'value', order: 'desc' })
    const values = results.map((r) => (r as any).value)
    expect(values).toEqual([300, 200, 100])
  })

  // ─── Pagination ────────────────────────────────────────────────────

  it('cursor pagination returns correct pages with no overlap', async () => {
    const { db } = await createD1TestDB()
    for (let i = 0; i < 7; i++) {
      await db.deal.create({ title: `Deal ${i}`, value: i * 100 })
    }

    const page1 = await db.deal.findPage({ limit: 3 })
    expect(page1.records).toHaveLength(3)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await db.deal.findPage({ limit: 3, cursor: page1.nextCursor })
    expect(page2.records).toHaveLength(3)
    expect(page2.nextCursor).toBeDefined()

    const page3 = await db.deal.findPage({ limit: 3, cursor: page2.nextCursor })
    expect(page3.records).toHaveLength(1)
    expect(page3.nextCursor).toBeUndefined()

    // No overlap across pages
    const allIds = [
      ...page1.records.map((r) => r.id),
      ...page2.records.map((r) => r.id),
      ...page3.records.map((r) => r.id),
    ]
    expect(new Set(allIds).size).toBe(7)
  })

  it('cursor pagination works with non-unique sort columns', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'lead' })
    await db.deal.create({ title: 'B', stage: 'lead' })
    await db.deal.create({ title: 'C', stage: 'lead' })
    await db.deal.create({ title: 'D', stage: 'won' })

    const page1 = await db.deal.findPage({ limit: 2, orderBy: 'stage', order: 'asc' })
    const page2 = await db.deal.findPage({ limit: 2, orderBy: 'stage', order: 'asc', cursor: page1.nextCursor })

    const allIds = [...page1.records, ...page2.records].map((r) => r.id)
    expect(new Set(allIds).size).toBe(4) // no duplicates
  })

  // ─── Combination tests ────────────────────────────────────────────

  it('filter + sort + limit together', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'won', value: 100 })
    await db.deal.create({ title: 'B', stage: 'won', value: 500 })
    await db.deal.create({ title: 'C', stage: 'won', value: 200 })
    await db.deal.create({ title: 'D', stage: 'lead', value: 900 })

    const results = await db.deal.find({
      filter: { stage: 'won' },
      orderBy: 'value',
      order: 'desc',
      limit: 2,
    })

    expect(results).toHaveLength(2)
    expect((results[0] as any).value).toBe(500)
    expect((results[1] as any).value).toBe(200)
  })

  it('filter + cursor pagination', async () => {
    const { db } = await createD1TestDB()
    for (let i = 0; i < 5; i++) {
      await db.deal.create({ title: `Won ${i}`, stage: 'won', value: i * 100 })
    }
    await db.deal.create({ title: 'Lead', stage: 'lead', value: 999 })

    const page1 = await db.deal.findPage({ filter: { stage: 'won' }, limit: 2 })
    expect(page1.records).toHaveLength(2)

    const page2 = await db.deal.findPage({ filter: { stage: 'won' }, limit: 2, cursor: page1.nextCursor })
    expect(page2.records).toHaveLength(2)

    // Lead deal should never appear
    const all = [...page1.records, ...page2.records]
    expect(all.every((r) => (r as any).stage === 'won')).toBe(true)
  })

  // ─── Edge cases ────────────────────────────────────────────────────

  it('empty in() returns no results', async () => {
    const { db } = await createD1TestDB()
    await db.deal.create({ title: 'A', stage: 'won' })

    const results = await db.deal.find({ filter: { stage: { in: [] } } })
    expect(results).toHaveLength(0)
  })

  it('rejects unsafe column names', async () => {
    const { db } = await createD1TestDB()
    await expect(
      db.deal.find({ filter: { 'DROP TABLE crm_deal; --': 'hack' } as any })
    ).rejects.toThrow()
  })

  it('find with no results returns empty array', async () => {
    const { db } = await createD1TestDB()
    const results = await db.deal.find({ filter: { stage: 'nonexistent' } })
    expect(results).toEqual([])
  })

  it('findPage with no results returns empty page', async () => {
    const { db } = await createD1TestDB()
    const page = await db.deal.findPage({ filter: { stage: 'nonexistent' } })
    expect(page.records).toEqual([])
    expect(page.nextCursor).toBeUndefined()
  })
})
