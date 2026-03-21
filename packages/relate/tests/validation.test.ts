import { describe, it, expect } from 'vitest'
import { validateAttributes } from '../src/validation'
import { ValidationError } from '../src/errors'

describe('validateAttributes', () => {
  const schema = {
    attributes: {
      email: { type: 'email' as const, required: true },
      name: 'text' as const,
      active: { type: 'boolean' as const, required: true },
    },
  }

  it('passes when all required fields are present', () => {
    expect(() => {
      validateAttributes('person', schema, { email: 'a@b.com', active: true })
    }).not.toThrow()
  })

  it('throws for missing required field', () => {
    expect(() => {
      validateAttributes('person', schema, { active: true })
    }).toThrow(ValidationError)
  })

  it('throws for null required field', () => {
    expect(() => {
      validateAttributes('person', schema, { email: null, active: true })
    }).toThrow(ValidationError)
  })

  it('throws for empty string required field', () => {
    expect(() => {
      validateAttributes('person', schema, { email: '', active: true })
    }).toThrow(ValidationError)
  })

  it('includes field name in error detail', () => {
    try {
      validateAttributes('person', schema, { active: true })
      expect.unreachable()
    } catch (err) {
      expect((err as ValidationError).detail.field).toBe('email')
      expect((err as ValidationError).detail.object).toBe('person')
    }
  })

  it('ignores optional fields', () => {
    expect(() => {
      validateAttributes('person', schema, { email: 'a@b.com', active: true })
      // name is optional — not provided, no error
    }).not.toThrow()
  })
})
