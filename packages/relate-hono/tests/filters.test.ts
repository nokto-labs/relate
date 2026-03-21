import { describe, it, expect } from 'vitest'
import { defineSchema } from '@nokto-labs/relate'
import { parseFilters } from '../src/filters'

describe('parseFilters', () => {
  const schema = defineSchema({
    objects: {
      person: {
        attributes: {
          name: 'text',
          active: 'boolean',
          signedUpAt: 'date',
          value: 'number',
        },
      },
    },
  })

  it('parses equality filters', () => {
    const result = parseFilters({ tier: ['vip'], source: ['referral'] })
    expect(result).toEqual({ tier: 'vip', source: 'referral' })
  })

  it('parses operator bracket notation', () => {
    const result = parseFilters({ 'value[gte]': ['100'], 'value[lt]': ['500'] })
    expect(result).toEqual({ value: { gte: 100, lt: 500 } })
  })

  it('parses in operator as array', () => {
    const result = parseFilters({ 'stage[in]': ['lead,qualified,won'] })
    expect(result).toEqual({ stage: { in: ['lead', 'qualified', 'won'] } })
  })

  it('ignores reserved params', () => {
    const result = parseFilters({ limit: ['10'], offset: ['0'], tier: ['vip'] })
    expect(result).toEqual({ tier: 'vip' })
  })

  it('returns undefined for empty filters', () => {
    const result = parseFilters({ limit: ['10'] })
    expect(result).toBeUndefined()
  })

  it('converts numeric strings to numbers', () => {
    const result = parseFilters({ 'value[gt]': ['42'] })
    expect(result).toEqual({ value: { gt: 42 } })
  })

  it('keeps non-numeric strings as strings', () => {
    const result = parseFilters({ 'name[like]': ['Ali%'] })
    expect(result).toEqual({ name: { like: 'Ali%' } })
  })

  it('parses booleans with schema awareness', () => {
    const result = parseFilters({ active: ['true'] }, schema.objects.person)
    expect(result).toEqual({ active: true })
  })

  it('parses dates with schema awareness', () => {
    const result = parseFilters({ 'signedUpAt[gte]': ['2026-01-01T00:00:00.000Z'] }, schema.objects.person)
    expect(result).toEqual({ signedUpAt: { gte: new Date('2026-01-01T00:00:00.000Z') } })
  })

  it('rejects unknown schema-backed filter keys', () => {
    expect(() => parseFilters({ nope: ['x'] }, schema.objects.person)).toThrow()
  })
})
