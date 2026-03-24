import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, createTestApp, req, resetDB } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('List routes', () => {
  it('passes filter and offset through to item listing', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/deals', { title: 'Small Won', value: 50 })
    await req(app, 'POST', '/deals', { title: 'Big Won', value: 200 })
    await req(app, 'POST', '/deals', { title: 'Huge Won', value: 300 })

    const created = await req(app, 'POST', '/lists', {
      name: 'Won deals',
      object: 'deal',
      type: 'dynamic',
      filter: { value: { gte: 50 } },
    })
    const list = await created.json()

    const res = await req(app, 'GET', `/lists/${list.id}/items?value[gte]=100&limit=1&offset=1`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.records).toHaveLength(1)
    expect(body.records[0].title).toBe('Big Won')
  })

  it('passes filters through to list counts', async () => {
    const { app } = await createTestApp()
    await req(app, 'POST', '/deals', { title: 'Small', value: 50 })
    await req(app, 'POST', '/deals', { title: 'Big', value: 200 })
    await req(app, 'POST', '/deals', { title: 'Huge', value: 300 })

    const created = await req(app, 'POST', '/lists', {
      name: 'All deals',
      object: 'deal',
      type: 'dynamic',
      filter: { value: { gte: 50 } },
    })
    const list = await created.json()

    const res = await req(app, 'GET', `/lists/${list.id}/count?value[lte]=200`)
    expect(res.status).toBe(200)
    expect((await res.json()).count).toBe(2)
  })

  it('rejects invalid pagination values', async () => {
    const { app } = await createTestApp()
    const res = await req(app, 'GET', '/deals?limit=abc')

    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.field).toBe('limit')
  })
})
