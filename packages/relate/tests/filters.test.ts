import { describe, it, expect } from 'vitest'
import { matchesFilter, mergeFilters } from '../src'

describe('filter helpers', () => {
  describe('matchesFilter', () => {
    it('matches equality and operator filters', () => {
      const record = {
        stage: 'won',
        value: 250,
        active: true,
        signedUpAt: new Date('2026-01-15T00:00:00.000Z'),
      }

      expect(matchesFilter(record, {
        stage: 'won',
        value: { gte: 100, lte: 300 },
        active: true,
        signedUpAt: { gte: new Date('2026-01-01T00:00:00.000Z') },
      })).toBe(true)
    })

    it('supports like and in operators', () => {
      const record = { email: 'alice@test.com', tier: 'vip' }

      expect(matchesFilter(record, {
        email: { like: 'ali%@test.com' },
        tier: { in: ['vip', 'trial'] },
      })).toBe(true)
    })

    it('returns false when any filter does not match', () => {
      const record = { stage: 'lead', value: 50 }
      expect(matchesFilter(record, { stage: 'won' })).toBe(false)
      expect(matchesFilter(record, { value: { gt: 100 } })).toBe(false)
    })
  })

  describe('mergeFilters', () => {
    it('deep-merges operator objects for the same field', () => {
      expect(mergeFilters(
        { value: { lte: 500 } },
        { value: { gte: 100 } },
      )).toEqual({
        value: {
          lte: 500,
          gte: 100,
        },
      })
    })

    it('lets later equality filters replace earlier values', () => {
      expect(mergeFilters(
        { stage: 'lead' },
        { stage: 'won' },
      )).toEqual({
        stage: 'won',
      })
    })
  })
})
