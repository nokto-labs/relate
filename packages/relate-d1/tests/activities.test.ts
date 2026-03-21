import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestCRM, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Activities', () => {
  it('tracks an activity with correct fields', async () => {
    const { crm } = await createD1TestCRM()
    const deal = await crm.deal.create({ title: 'Test' })

    const activity = await crm.activities.track({
      record: { object: 'deal', id: deal.id },
      type: 'stage_changed',
      metadata: { from: 'lead', to: 'won' },
    })

    expect(activity.id).toBeDefined()
    expect(activity.type).toBe('stage_changed')
    expect(activity.metadata.from).toBe('lead')
    expect(activity.metadata.to).toBe('won')
    expect(activity.occurredAt).toBeInstanceOf(Date)
    expect(activity.createdAt).toBeInstanceOf(Date)
  })

  it('lists activities for a record', async () => {
    const { crm } = await createD1TestCRM()
    const deal = await crm.deal.create({ title: 'List' })

    await crm.activities.track({ record: { object: 'deal', id: deal.id }, type: 'a' })
    await crm.activities.track({ record: { object: 'deal', id: deal.id }, type: 'b' })

    const list = await crm.activities.list({ object: 'deal', id: deal.id })
    expect(list).toHaveLength(2)
  })

  it('backdates with occurredAt', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'backdate@test.com' })
    const past = new Date('2024-01-15T10:00:00Z')

    const activity = await crm.activities.track({
      record: { object: 'person', id: person.id },
      type: 'meeting',
      occurredAt: past,
    })

    expect(activity.occurredAt.getTime()).toBe(past.getTime())
  })

  it('filters by type', async () => {
    const { crm } = await createD1TestCRM()
    const person = await crm.person.create({ email: 'type@test.com' })

    await crm.activities.track({ record: { object: 'person', id: person.id }, type: 'email' })
    await crm.activities.track({ record: { object: 'person', id: person.id }, type: 'call' })
    await crm.activities.track({ record: { object: 'person', id: person.id }, type: 'email' })

    const emails = await crm.activities.list(
      { object: 'person', id: person.id },
      { type: 'email' },
    )
    expect(emails).toHaveLength(2)
    expect(emails.every((a) => a.type === 'email')).toBe(true)
  })

  it('limits results', async () => {
    const { crm } = await createD1TestCRM()
    const deal = await crm.deal.create({ title: 'Limit' })

    for (let i = 0; i < 5; i++) {
      await crm.activities.track({ record: { object: 'deal', id: deal.id }, type: `e${i}` })
    }

    const limited = await crm.activities.list(
      { object: 'deal', id: deal.id },
      { limit: 2 },
    )
    expect(limited).toHaveLength(2)
  })

  it('tracks activity with empty metadata', async () => {
    const { crm } = await createD1TestCRM()
    const deal = await crm.deal.create({ title: 'NoMeta' })

    const activity = await crm.activities.track({
      record: { object: 'deal', id: deal.id },
      type: 'viewed',
    })

    expect(activity.metadata).toEqual({})
  })
})
