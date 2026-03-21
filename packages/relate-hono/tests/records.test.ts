import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestApp, resetDB, cleanup, req } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('Record routes', () => {
  it('POST creates and returns 201 with full record', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'POST', '/people', { email: 'alice@test.com', name: 'Alice' })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(body.email).toBe('alice@test.com')
    expect(body.name).toBe('Alice')
    expect(body.createdAt).toBeDefined()
  })

  it('POST rejects duplicate with 409 and structured error', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/people', { email: 'dup@test.com' })
    const res = await req(app, 'POST', '/people', { email: 'dup@test.com' })

    expect(res.status).toBe(409)
    const { error } = await res.json()
    expect(error.code).toBe('DUPLICATE_RECORD')
    expect(error.field).toBe('email')
    expect(error.value).toBe('dup@test.com')
    expect(error.object).toBe('person')
  })

  it('POST rejects missing required field with 400', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'POST', '/people', { name: 'No email' })

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.field).toBe('email')
  })

  it('GET /:id returns full record', async () => {
    const { app } = await createTestApp()
    const create = await (await req(app, 'POST', '/deals', { title: 'Test', value: 42 })).json()

    const res = await req(app, 'GET', `/deals/${create.id}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.id).toBe(create.id)
    expect(body.title).toBe('Test')
    expect(body.value).toBe(42)
  })

  it('GET /:id returns 404 for missing', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'GET', '/deals/nonexistent')
    expect(res.status).toBe(404)
  })

  it('GET lists with exact count', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/deals', { title: 'A' })
    await req(app, 'POST', '/deals', { title: 'B' })

    const res = await req(app, 'GET', '/deals')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].title).toBeDefined()
    expect(body[1].title).toBeDefined()
  })

  it('PATCH updates and returns updated record', async () => {
    const { app } = await createTestApp()
    const { id } = await (await req(app, 'POST', '/deals', { title: 'Before', value: 10 })).json()

    const res = await req(app, 'PATCH', `/deals/${id}`, { title: 'After' })
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.title).toBe('After')
    expect(body.value).toBe(10) // untouched
  })

  it('DELETE returns 204', async () => {
    const { app } = await createTestApp()
    const { id } = await (await req(app, 'POST', '/deals', { title: 'Gone' })).json()

    const res = await req(app, 'DELETE', `/deals/${id}`)
    expect(res.status).toBe(204)

    const check = await req(app, 'GET', `/deals/${id}`)
    expect(check.status).toBe(404)
  })

  it('DELETE returns 404 for non-existent record', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'DELETE', '/deals/nonexistent')
    expect(res.status).toBe(404)
  })

  it('returns 404 for unknown resource', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'GET', '/pandas')
    expect(res.status).toBe(404)
  })

  it('PUT upserts — creates then merges', async () => {
    const { app } = await createTestApp()
    const first = await (await req(app, 'PUT', '/people', { email: 'upsert@test.com', name: 'Bob' })).json()
    expect(first.name).toBe('Bob')

    const second = await (await req(app, 'PUT', '/people', { email: 'upsert@test.com', name: 'Bobby' })).json()
    expect(second.name).toBe('Bobby')
    expect(second.id).toBe(first.id) // same record
  })

  it('GET /count returns exact count', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/deals', { title: 'A' })
    await req(app, 'POST', '/deals', { title: 'B' })
    await req(app, 'POST', '/deals', { title: 'C' })

    const res = await req(app, 'GET', '/deals/count')
    expect(res.status).toBe(200)
    expect((await res.json()).count).toBe(3)
  })

  it('GET filters boolean fields using schema-aware parsing', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/people', { email: 'active@test.com', active: true })
    await req(app, 'POST', '/people', { email: 'inactive@test.com', active: false })

    const res = await req(app, 'GET', '/people?active=true')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe('active@test.com')
  })

  it('GET filters date fields using schema-aware parsing', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/people', {
      email: 'early@test.com',
      signedUpAt: '2026-01-01T00:00:00.000Z',
    })
    await req(app, 'POST', '/people', {
      email: 'late@test.com',
      signedUpAt: '2026-02-01T00:00:00.000Z',
    })

    const res = await req(app, 'GET', '/people?signedUpAt[gte]=2026-01-15T00:00:00.000Z')
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].email).toBe('late@test.com')
  })
})
