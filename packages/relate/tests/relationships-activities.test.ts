import { describe, expect, it } from 'vitest'
import { defineSchema, relate } from '../src'
import { RefNotFoundError, ValidationError } from '../src/errors'
import { createMockAdapter } from './helpers'

function createDB() {
  const adapter = createMockAdapter()
  const schema = defineSchema({
    objects: {
      person: {
        attributes: {
          email: { type: 'email', required: true },
        },
      },
      company: {
        attributes: {
          domain: { type: 'text', required: true },
        },
      },
    },
    relationships: {
      works_at: { from: 'person', to: 'company' },
    },
  })

  return { db: relate({ adapter, schema }), adapter }
}

describe('relationships and activities integrity', () => {
  it('rejects unknown relationship types when schema declares allowed types', async () => {
    const { db, adapter } = createDB()
    const person = await adapter.createRecord('person', { email: 'alice@test.com' })
    const company = await adapter.createRecord('company', { domain: 'acme.com' })

    await expect(
      db.relationships.create({
        from: { object: 'person', id: person.id },
        to: { object: 'company', id: company.id },
        type: 'owner',
      }),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects relationship endpoints that do not match the declared shape', async () => {
    const { db, adapter } = createDB()
    const person = await adapter.createRecord('person', { email: 'alice@test.com' })
    const company = await adapter.createRecord('company', { domain: 'acme.com' })

    await expect(
      db.relationships.create({
        from: { object: 'company', id: company.id },
        to: { object: 'person', id: person.id },
        type: 'works_at',
      } as any),
    ).rejects.toThrow(ValidationError)
  })

  it('rejects relationships that point at missing records', async () => {
    const { db } = createDB()

    await expect(
      db.relationships.create({
        from: { object: 'person', id: 'missing-person' },
        to: { object: 'company', id: 'missing-company' },
        type: 'works_at',
      }),
    ).rejects.toThrow(RefNotFoundError)
  })

  it('rejects activities for missing records', async () => {
    const { db } = createDB()

    await expect(
      db.activities.track({
        record: { object: 'person', id: 'missing-person' },
        type: 'emailed',
      }),
    ).rejects.toThrow(RefNotFoundError)
  })
})
