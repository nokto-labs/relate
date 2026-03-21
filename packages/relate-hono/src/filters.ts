import type { AttributeSchema, ObjectSchema } from '@nokto-labs/relate'
import { ValidationError } from '@nokto-labs/relate'

const RESERVED_PARAMS = new Set(['limit', 'offset', 'orderBy', 'order', 'cursor'])

export function parseFilters(
  queries: Record<string, string[]>,
  objectSchema?: ObjectSchema,
): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {}

  for (const [key, values] of Object.entries(queries)) {
    if (RESERVED_PARAMS.has(key)) continue

    const match = key.match(/^([a-zA-Z_]\w*)\[(\w+)]$/)
    if (match) {
      const [, field, op] = match
      const attrSchema = getAttributeSchema(objectSchema, field)
      const existing = (filter[field] ?? {}) as Record<string, unknown>
      const val = values[0]
      existing[op] = op === 'in'
        ? val.split(',').map((entry) => parseValue(entry, attrSchema, op))
        : parseValue(val, attrSchema, op)
      filter[field] = existing
    } else if (/^[a-zA-Z_]\w*$/.test(key)) {
      filter[key] = parseValue(values[0], getAttributeSchema(objectSchema, key))
    }
  }

  return Object.keys(filter).length > 0 ? filter : undefined
}

function getAttributeSchema(objectSchema: ObjectSchema | undefined, field: string): AttributeSchema | undefined {
  if (!objectSchema) return undefined

  const attrSchema = objectSchema.attributes[field]
  if (!attrSchema) {
    throw new ValidationError({ message: `Unknown filter attribute "${field}"`, field })
  }
  return attrSchema
}

function parseValue(v: string, schema?: AttributeSchema, op?: string): string | number | boolean | Date {
  if (!schema) {
    const n = Number(v)
    return !Number.isNaN(n) && v.trim() !== '' ? n : v
  }

  const type = typeof schema === 'string' ? schema : schema.type
  if (op === 'like') return v

  if (type === 'number') {
    const n = Number(v)
    if (Number.isNaN(n) || v.trim() === '') {
      throw new ValidationError({ message: `Invalid filter value "${v}": expected number` })
    }
    return n
  }

  if (type === 'boolean') {
    if (v === 'true' || v === '1') return true
    if (v === 'false' || v === '0') return false
    throw new ValidationError({ message: `Invalid filter value "${v}": expected boolean` })
  }

  if (type === 'date') {
    const timestamp = /^\d+$/.test(v) ? Number(v) : Date.parse(v)
    if (Number.isNaN(timestamp)) {
      throw new ValidationError({ message: `Invalid filter value "${v}": expected date` })
    }
    return new Date(timestamp)
  }

  return v
}
