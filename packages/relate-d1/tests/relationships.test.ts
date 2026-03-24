import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('D1 Relationships', () => {
  it('creates a relationship with correct fields', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'rel@test.com' })
    const company = await db.company.create({ domain: 'rel.com' })

    const rel = await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
    })

    expect(rel.id).toBeDefined()
    expect(rel.from.object).toBe('person')
    expect(rel.to.object).toBe('company')
    expect(rel.type).toBe('works_at')
    expect(rel.createdAt).toBeInstanceOf(Date)
  })

  it('rejects undeclared relationship types', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'unknown-type@test.com' })
    const company = await db.company.create({ domain: 'unknown-type.com' })

    await expect(
      db.relationships.create({
        from: { object: 'person', id: person.id },
        to: { object: 'company', id: company.id },
        type: 'advisor',
      }),
    ).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'type' }),
    })
  })

  it('rejects endpoint shapes that do not match the schema declaration', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'shape@test.com' })
    const company = await db.company.create({ domain: 'shape.com' })

    await expect(
      db.relationships.create({
        from: { object: 'company', id: company.id },
        to: { object: 'person', id: person.id },
        type: 'works_at',
      } as any),
    ).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'type' }),
    })
  })

  it('rejects relationships that point at missing records', async () => {
    const { db } = await createD1TestDB()

    await expect(
      db.relationships.create({
        from: { object: 'person', id: 'missing-person' },
        to: { object: 'company', id: 'missing-company' },
        type: 'works_at',
      }),
    ).rejects.toMatchObject({
      name: 'RefNotFoundError',
      detail: expect.objectContaining({ code: 'REF_NOT_FOUND', field: 'from' }),
    })
  })

  it('lists bidirectionally', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'bi@test.com' })
    const company = await db.company.create({ domain: 'bi.com' })

    await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
    })

    const fromPerson = await db.relationships.list({ object: 'person', id: person.id })
    const fromCompany = await db.relationships.list({ object: 'company', id: company.id })

    expect(fromPerson).toHaveLength(1)
    expect(fromCompany).toHaveLength(1)
    expect(fromPerson[0].id).toBe(fromCompany[0].id)
  })

  it('filters by type correctly', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'filter@test.com' })
    const company = await db.company.create({ domain: 'filter.com' })
    const deal = await db.deal.create({ title: 'Filter deal' })

    await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
    })
    await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'deal', id: deal.id },
      type: 'owner',
    })

    const worksAt = await db.relationships.list(
      { object: 'person', id: person.id },
      { type: 'works_at' },
    )
    expect(worksAt).toHaveLength(1)
    expect(worksAt[0].type).toBe('works_at')

    const owners = await db.relationships.list(
      { object: 'person', id: person.id },
      { type: 'owner' },
    )
    expect(owners).toHaveLength(1)
    expect(owners[0].type).toBe('owner')
  })

  it('stores and updates extra attributes', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'attr@test.com' })
    const company = await db.company.create({ domain: 'attr.com' })

    const rel = await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
      attributes: { role: 'Engineer', since: '2023' },
    })

    expect(rel.role).toBe('Engineer')
    expect(rel.since).toBe('2023')

    const updated = await db.relationships.update(rel.id, { role: 'CTO' })
    expect(updated.role).toBe('CTO')
    expect(updated.since).toBe('2023') // preserved
  })

  it('deletes a relationship', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'del@test.com' })
    const company = await db.company.create({ domain: 'del.com' })

    const rel = await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
    })

    await db.relationships.delete(rel.id)

    const remaining = await db.relationships.list({ object: 'person', id: person.id })
    expect(remaining).toHaveLength(0)
  })

  it('throws when deleting a missing relationship', async () => {
    const { db } = await createD1TestDB()

    await expect(db.relationships.delete('missing')).rejects.toMatchObject({
      name: 'NotFoundError',
      detail: expect.objectContaining({ code: 'RELATIONSHIP_NOT_FOUND' }),
    })
  })

  it('cascade: deleting a record cleans up its relationships', async () => {
    const { db } = await createD1TestDB()
    const person = await db.person.create({ email: 'cascade@test.com' })
    const company = await db.company.create({ domain: 'cascade.com' })

    await db.relationships.create({
      from: { object: 'person', id: person.id },
      to: { object: 'company', id: company.id },
      type: 'works_at',
    })

    await db.person.delete(person.id)

    const remaining = await db.relationships.list({ object: 'company', id: company.id })
    expect(remaining).toHaveLength(0)
  })
})
