import { Hono } from 'hono'
import type { SchemaDefinition } from '@nokto-labs/relate'
import type { HonoEnv } from '../types'

export function schemaRoutes(schema: SchemaDefinition) {
  const app = new Hono<HonoEnv>()

  app.get('/schema', (c) => {
    return c.json(schema)
  })

  return app
}
