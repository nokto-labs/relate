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

  it('scopes record routes and removes the default top-level record mount', async () => {
    const { app } = await createTestApp({
      scopes: {
        public: {
          prefix: '/api',
          objects: {
            deal: { operations: ['list', 'get'] },
          },
        },
        admin: {
          prefix: '/api/admin',
          objects: 'all',
        },
      },
    })

    const created = await req(app, 'POST', '/api/admin/deals', { title: 'Scoped deal' })
    expect(created.status).toBe(201)

    expect((await req(app, 'GET', '/deals')).status).toBe(404)
    expect((await req(app, 'POST', '/api/deals', { title: 'Blocked' })).status).toBe(404)
    expect((await req(app, 'GET', '/api/deals')).status).toBe(200)
  })

  it('applies scope filters to list and get routes', async () => {
    const { app } = await createTestApp({
      scopes: {
        public: {
          prefix: '/api',
          objects: {
            person: { operations: ['list', 'get'], filter: { active: true } },
          },
        },
        admin: {
          prefix: '/api/admin',
          objects: 'all',
        },
      },
    })

    const active = await (await req(app, 'POST', '/api/admin/people', {
      email: 'visible@test.com',
      active: true,
    })).json()
    const inactive = await (await req(app, 'POST', '/api/admin/people', {
      email: 'hidden@test.com',
      active: false,
    })).json()

    const list = await req(app, 'GET', '/api/people')
    expect(list.status).toBe(200)
    expect((await list.json()).map((person: any) => person.email)).toEqual(['visible@test.com'])

    expect((await req(app, 'GET', `/api/people/${active.id}`)).status).toBe(200)
    expect((await req(app, 'GET', `/api/people/${inactive.id}`)).status).toBe(404)
  })

  it('applies scope filters to update and delete routes', async () => {
    const { app } = await createTestApp({
      scopes: {
        admin: {
          prefix: '/api/admin',
          objects: 'all',
        },
        moderated: {
          prefix: '/api/mod',
          objects: {
            person: { operations: ['get', 'update', 'delete'], filter: { active: true } },
          },
        },
      },
    })

    const visible = await (await req(app, 'POST', '/api/admin/people', {
      email: 'visible@test.com',
      active: true,
    })).json()
    const hidden = await (await req(app, 'POST', '/api/admin/people', {
      email: 'hidden@test.com',
      active: false,
    })).json()

    expect((await req(app, 'PATCH', `/api/mod/people/${hidden.id}`, { name: 'Nope' })).status).toBe(404)
    expect((await req(app, 'DELETE', `/api/mod/people/${hidden.id}`)).status).toBe(404)

    expect((await req(app, 'PATCH', `/api/mod/people/${visible.id}`, { name: 'Updated' })).status).toBe(200)
    expect((await req(app, 'DELETE', `/api/mod/people/${visible.id}`)).status).toBe(204)
  })

  it('deep-merges scoped filters with query operators', async () => {
    const { app } = await createTestApp({
      scopes: {
        admin: {
          prefix: '/api/admin',
          objects: 'all',
        },
        public: {
          prefix: '/api',
          objects: {
            deal: {
              operations: ['list'],
              filter: { value: { gte: 100 } },
            },
            person: { operations: ['list'] },
          },
        },
      },
    })

    await req(app, 'POST', '/api/admin/deals', { title: 'Low', value: 50 })
    await req(app, 'POST', '/api/admin/deals', { title: 'Mid', value: 200 })
    await req(app, 'POST', '/api/admin/deals', { title: 'High', value: 700 })

    const res = await req(app, 'GET', '/api/deals?value[lte]=500')
    expect(res.status).toBe(200)
    expect((await res.json()).map((deal: any) => deal.title)).toEqual(['Mid'])
  })

  it('runs per-scope middleware', async () => {
    const adminAuth = async (c: any, next: () => Promise<void>) => {
      if (c.req.header('x-admin') !== '1') {
        return c.json({ error: 'unauthorized' }, 401)
      }
      await next()
    }

    const { app } = await createTestApp({
      scopes: {
        admin: {
          prefix: '/api/admin',
          middleware: [adminAuth],
          objects: 'all',
        },
      },
    })

    expect((await req(app, 'POST', '/api/admin/deals', { title: 'Denied' })).status).toBe(401)
    expect((await req(app, 'POST', '/api/admin/deals', { title: 'Allowed' }, { headers: { 'x-admin': '1' } })).status).toBe(201)
  })

  it('rejects unknown scoped objects at app creation time', async () => {
    await expect(createTestApp({
      scopes: {
        public: {
          prefix: '/api',
          objects: {
            panda: { operations: ['list'] },
          },
        },
      },
    })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', field: 'panda' }),
    })
  })

  it('rejects partial scope coverage at app creation time', async () => {
    await expect(createTestApp({
      scopes: {
        public: {
          prefix: '/api',
          objects: {
            deal: { operations: ['list'] },
          },
        },
      },
    })).rejects.toMatchObject({
      name: 'ValidationError',
      detail: expect.objectContaining({ code: 'VALIDATION_ERROR', fields: ['person'] }),
    })
  })
})
