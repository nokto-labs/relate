import { Hono } from 'hono'
import type { HonoEnv } from '../types'

export function migrateRoutes() {
  const app = new Hono<HonoEnv>()

  app.post('/migrate', async (c) => {
    const db = c.get('db')
    await db.migrate()
    return c.json({ ok: true })
  })

  return app
}
