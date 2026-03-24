import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestApp, resetDB, cleanup, req } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('Route config', () => {
  it('meta routes are disabled by default', async () => {
    const { app } = await createTestApp()
    const schemaRes = await req(app, 'GET', '/schema')
    const migrateRes = await req(app, 'POST', '/migrate')

    expect(schemaRes.status).toBe(404)
    expect(migrateRes.status).toBe(404)
  })

  it('GET /schema returns full schema definition when explicitly enabled', async () => {
    const { app } = await createTestApp({ routes: { schema: true } })
    const res = await req(app, 'GET', '/schema')

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.objects.person.attributes.email.type).toBe('email')
    expect(body.objects.person.attributes.email.required).toBe(true)
    expect(body.objects.person.uniqueBy).toBe('email')
    expect(body.objects.deal.attributes.title).toBeDefined()
  })

  it('disabled routes return 404', async () => {
    const { app } = await createTestApp({ routes: { lists: false } })
    const res = await req(app, 'GET', '/lists')
    expect(res.status).toBe(404)
  })

  it('maxLimit caps results silently', async () => {
    const { app } = await createTestApp({ maxLimit: 2 })
    await req(app, 'POST', '/deals', { title: 'A' })
    await req(app, 'POST', '/deals', { title: 'B' })
    await req(app, 'POST', '/deals', { title: 'C' })

    const res = await req(app, 'GET', '/deals?limit=100')
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('maxLimit applies when no limit specified', async () => {
    const { app } = await createTestApp({ maxLimit: 1 })
    await req(app, 'POST', '/deals', { title: 'A' })
    await req(app, 'POST', '/deals', { title: 'B' })

    const res = await req(app, 'GET', '/deals')
    const body = await res.json()
    expect(body).toHaveLength(1)
  })

  it('POST /migrate succeeds when explicitly enabled', async () => {
    const { app } = await createTestApp({ routes: { migrate: true } })
    const res = await req(app, 'POST', '/migrate')
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })

  it('prefix routes all endpoints', async () => {
    const { app } = await createTestApp({ prefix: '/api/v1', routes: { migrate: true } })

    // Prefixed works
    const migrate = await req(app, 'POST', '/api/v1/migrate')
    expect(migrate.status).toBe(200)

    // Un-prefixed doesn't
    const root = await req(app, 'POST', '/migrate')
    expect(root.status).toBe(404)
  })

  it('maxLimit still allows an explicit limit of 0', async () => {
    const { app } = await createTestApp({ maxLimit: 2 })
    await req(app, 'POST', '/deals', { title: 'A' })
    await req(app, 'POST', '/deals', { title: 'B' })

    const res = await req(app, 'GET', '/deals?limit=0')
    const body = await res.json()
    expect(body).toHaveLength(0)
  })

  it('rejects invalid maxLimit at app creation time', async () => {
    await expect(createTestApp({ maxLimit: -1 })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'maxLimit' }),
    })
  })
})
