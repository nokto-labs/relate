import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestCRM, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Queries', () => {
  // ─── Filtering ─────────────────────────────────────────────────────

  it('filters by equality', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'Won', stage: 'won', value: 100 })
    await crm.deal.create({ title: 'Lead', stage: 'lead', value: 50 })

    const won = await crm.deal.find({ filter: { stage: 'won' } })
    expect(won).toHaveLength(1)
    expect((won[0] as any).title).toBe('Won')
  })

  it('filters with gt/lt operators', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'Small', value: 10 })
    await crm.deal.create({ title: 'Medium', value: 500 })
    await crm.deal.create({ title: 'Big', value: 5000 })

    const results = await crm.deal.find({ filter: { value: { gt: 100, lt: 1000 } } })
    expect(results).toHaveLength(1)
    expect((results[0] as any).title).toBe('Medium')
  })

  it('filters with gte/lte operators', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', value: 100 })
    await crm.deal.create({ title: 'B', value: 200 })
    await crm.deal.create({ title: 'C', value: 300 })

    const results = await crm.deal.find({ filter: { value: { gte: 100, lte: 200 } } })
    expect(results).toHaveLength(2)
  })

  it('filters with in operator', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'lead' })
    await crm.deal.create({ title: 'B', stage: 'won' })
    await crm.deal.create({ title: 'C', stage: 'qualified' })

    const results = await crm.deal.find({ filter: { stage: { in: ['lead', 'won'] } } })
    expect(results).toHaveLength(2)
    const stages = results.map((r) => (r as any).stage)
    expect(stages).toContain('lead')
    expect(stages).toContain('won')
    expect(stages).not.toContain('qualified')
  })

  it('filters with ne operator', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'won' })
    await crm.deal.create({ title: 'B', stage: 'lead' })

    const results = await crm.deal.find({ filter: { stage: { ne: 'won' } } })
    expect(results).toHaveLength(1)
    expect((results[0] as any).stage).toBe('lead')
  })

  it('filters with like operator', async () => {
    const { crm } = await createD1TestCRM()
    await crm.person.create({ email: 'alice@acme.com', name: 'Alice' })
    await crm.person.create({ email: 'bob@acme.com', name: 'Bob' })
    await crm.person.create({ email: 'alex@acme.com', name: 'Alex' })

    const results = await crm.person.find({ filter: { name: { like: 'Al%' } } })
    expect(results).toHaveLength(2)
    const names = results.map((r) => (r as any).name)
    expect(names).toContain('Alice')
    expect(names).toContain('Alex')
  })

  it('counts with filter', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'won' })
    await crm.deal.create({ title: 'B', stage: 'won' })
    await crm.deal.create({ title: 'C', stage: 'lead' })

    expect(await crm.deal.count({ stage: 'won' })).toBe(2)
    expect(await crm.deal.count({ stage: 'lead' })).toBe(1)
  })

  it('filters boolean fields correctly', async () => {
    const { crm } = await createD1TestCRM()
    await crm.person.create({ email: 'active@test.com', active: true })
    await crm.person.create({ email: 'inactive@test.com', active: false })

    const results = await crm.person.find({ filter: { active: true } })
    expect(results).toHaveLength(1)
    expect(results[0].email).toBe('active@test.com')
  })

  it('filters date fields correctly', async () => {
    const { crm } = await createD1TestCRM()
    await crm.person.create({ email: 'early@test.com', signedUpAt: new Date('2026-01-01T00:00:00.000Z') })
    await crm.person.create({ email: 'late@test.com', signedUpAt: new Date('2026-02-01T00:00:00.000Z') })

    const results = await crm.person.find({
      filter: { signedUpAt: { gte: new Date('2026-01-15T00:00:00.000Z') } },
    })

    expect(results).toHaveLength(1)
    expect(results[0].email).toBe('late@test.com')
  })

  // ─── Ordering ──────────────────────────────────────────────────────

  it('orders ascending', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'C', value: 300 })
    await crm.deal.create({ title: 'A', value: 100 })
    await crm.deal.create({ title: 'B', value: 200 })

    const results = await crm.deal.find({ orderBy: 'value', order: 'asc' })
    const values = results.map((r) => (r as any).value)
    expect(values).toEqual([100, 200, 300])
  })

  it('orders descending', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'C', value: 300 })
    await crm.deal.create({ title: 'A', value: 100 })
    await crm.deal.create({ title: 'B', value: 200 })

    const results = await crm.deal.find({ orderBy: 'value', order: 'desc' })
    const values = results.map((r) => (r as any).value)
    expect(values).toEqual([300, 200, 100])
  })

  // ─── Pagination ────────────────────────────────────────────────────

  it('cursor pagination returns correct pages with no overlap', async () => {
    const { crm } = await createD1TestCRM()
    for (let i = 0; i < 7; i++) {
      await crm.deal.create({ title: `Deal ${i}`, value: i * 100 })
    }

    const page1 = await crm.deal.findPage({ limit: 3 })
    expect(page1.records).toHaveLength(3)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await crm.deal.findPage({ limit: 3, cursor: page1.nextCursor })
    expect(page2.records).toHaveLength(3)
    expect(page2.nextCursor).toBeDefined()

    const page3 = await crm.deal.findPage({ limit: 3, cursor: page2.nextCursor })
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
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'lead' })
    await crm.deal.create({ title: 'B', stage: 'lead' })
    await crm.deal.create({ title: 'C', stage: 'lead' })
    await crm.deal.create({ title: 'D', stage: 'won' })

    const page1 = await crm.deal.findPage({ limit: 2, orderBy: 'stage', order: 'asc' })
    const page2 = await crm.deal.findPage({ limit: 2, orderBy: 'stage', order: 'asc', cursor: page1.nextCursor })

    const allIds = [...page1.records, ...page2.records].map((r) => r.id)
    expect(new Set(allIds).size).toBe(4) // no duplicates
  })

  // ─── Combination tests ────────────────────────────────────────────

  it('filter + sort + limit together', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'won', value: 100 })
    await crm.deal.create({ title: 'B', stage: 'won', value: 500 })
    await crm.deal.create({ title: 'C', stage: 'won', value: 200 })
    await crm.deal.create({ title: 'D', stage: 'lead', value: 900 })

    const results = await crm.deal.find({
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
    const { crm } = await createD1TestCRM()
    for (let i = 0; i < 5; i++) {
      await crm.deal.create({ title: `Won ${i}`, stage: 'won', value: i * 100 })
    }
    await crm.deal.create({ title: 'Lead', stage: 'lead', value: 999 })

    const page1 = await crm.deal.findPage({ filter: { stage: 'won' }, limit: 2 })
    expect(page1.records).toHaveLength(2)

    const page2 = await crm.deal.findPage({ filter: { stage: 'won' }, limit: 2, cursor: page1.nextCursor })
    expect(page2.records).toHaveLength(2)

    // Lead deal should never appear
    const all = [...page1.records, ...page2.records]
    expect(all.every((r) => (r as any).stage === 'won')).toBe(true)
  })

  // ─── Edge cases ────────────────────────────────────────────────────

  it('empty in() returns no results', async () => {
    const { crm } = await createD1TestCRM()
    await crm.deal.create({ title: 'A', stage: 'won' })

    const results = await crm.deal.find({ filter: { stage: { in: [] } } })
    expect(results).toHaveLength(0)
  })

  it('rejects unsafe column names', async () => {
    const { crm } = await createD1TestCRM()
    await expect(
      crm.deal.find({ filter: { 'DROP TABLE crm_deal; --': 'hack' } as any })
    ).rejects.toThrow()
  })

  it('find with no results returns empty array', async () => {
    const { crm } = await createD1TestCRM()
    const results = await crm.deal.find({ filter: { stage: 'nonexistent' } })
    expect(results).toEqual([])
  })

  it('findPage with no results returns empty page', async () => {
    const { crm } = await createD1TestCRM()
    const page = await crm.deal.findPage({ filter: { stage: 'nonexistent' } })
    expect(page.records).toEqual([])
    expect(page.nextCursor).toBeUndefined()
  })
})
