import type { ObjectSchema } from './types'

export function generateId(objectSchema: ObjectSchema): string {
  const raw = objectSchema.id ? objectSchema.id() : crypto.randomUUID()
  return objectSchema.idPrefix ? `${objectSchema.idPrefix}_${raw}` : raw
}
