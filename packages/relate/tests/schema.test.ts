import { describe, expect, it } from 'vitest'
import { defineSchema, relate } from '../src'
import { InvalidSchemaError } from '../src/errors'
import { createMockAdapter } from './helpers'

describe('schema validation', () => {
  it('rejects uniqueBy fields that do not exist', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            person: {
              uniqueBy: 'email',
              attributes: {
                name: 'text',
              },
            },
          },
        }),
      }),
    ).toThrow(InvalidSchemaError)
  })

  it('rejects duplicate plurals', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            person: {
              plural: 'records',
              attributes: { name: 'text' },
            },
            company: {
              plural: 'records',
              attributes: { domain: 'text' },
            },
          },
        }),
      }),
    ).toThrow(InvalidSchemaError)
  })

  it('rejects reserved object slugs', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            relationships: {
              attributes: { name: 'text' },
            },
          },
        }),
      }),
    ).toThrow(InvalidSchemaError)
  })

  it('allows "transaction" as an object slug now that it is not a public method', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            transaction: {
              attributes: { name: 'text' },
            },
          },
        }),
      }),
    ).not.toThrow()
  })

  it('rejects "webhook" as an object slug because it is a public helper', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            webhook: {
              attributes: { name: 'text' },
            },
          },
        }),
      }),
    ).toThrow(InvalidSchemaError)
  })

  it('rejects relationships that point at missing objects', () => {
    expect(() =>
      relate({
        adapter: createMockAdapter(),
        schema: defineSchema({
          objects: {
            person: {
              attributes: { email: 'email' },
            },
          },
          relationships: {
            works_at: { from: 'person', to: 'company' },
          },
        }),
      }),
    ).toThrow(InvalidSchemaError)
  })
})
