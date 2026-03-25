import type { RelateRecord, ObjectSchema, AttributeSchema } from '@nokto-labs/relate'
import { ValidationError } from '@nokto-labs/relate'

function attributeType(schema: AttributeSchema): string {
  return typeof schema === 'string' ? schema : schema.type
}

export function valueToSql(schema: AttributeSchema, value: unknown, field?: string): unknown {
  if (value === null || value === undefined) return null
  const type = attributeType(schema)

  if (type === 'text' || type === 'email' || type === 'url' || type === 'ref') {
    if (typeof value !== 'string') {
      throw new ValidationError({ message: `Invalid value for attribute "${field ?? 'unknown'}": expected ${type}`, field })
    }
    return value
  }

  if (type === 'select') {
    const options = typeof schema === 'object' && 'options' in schema ? schema.options : []
    if (typeof value !== 'string' || !options.includes(value)) {
      throw new ValidationError({
        message: `Invalid value for attribute "${field ?? 'unknown'}": expected one of ${options.join(', ')}`,
        field,
        options,
      })
    }
    return value
  }

  if (type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError({ message: `Invalid value for attribute "${field ?? 'unknown'}": expected number`, field })
    }
    return value
  }

  if (type === 'boolean') {
    if (typeof value === 'boolean') return value ? 1 : 0
    if (value === 1 || value === 0) return value
    throw new ValidationError({ message: `Invalid value for attribute "${field ?? 'unknown'}": expected boolean`, field })
  }

  if (type === 'date') {
    const timestamp = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime()
    if (Number.isNaN(timestamp)) {
      throw new ValidationError({ message: `Invalid value for attribute "${field ?? 'unknown'}": expected date`, field })
    }
    return timestamp
  }

  return value
}

export function filterValueToSql(schema: AttributeSchema, value: unknown, field?: string): unknown {
  if (value === null || value === undefined) return null
  const type = attributeType(schema)

  if (type === 'text' || type === 'email' || type === 'url' || type === 'select' || type === 'ref') {
    if (typeof value !== 'string') {
      throw new ValidationError({ message: `Invalid value for attribute "${field ?? 'unknown'}": expected ${type}`, field })
    }
    return value
  }

  return valueToSql(schema, value, field)
}

export function sqlToValue(schema: AttributeSchema, value: unknown): unknown {
  if (value === null || value === undefined) return undefined
  const type = typeof schema === 'string' ? schema : schema.type
  if (type === 'boolean') return value === 1
  if (type === 'date') return new Date(value as number)
  return value
}

export function rowToRecord(
  objectSchema: ObjectSchema,
  row: Record<string, unknown>,
): RelateRecord {
  const record: Record<string, unknown> = {
    id: row['id'],
    createdAt: new Date(row['created_at'] as number),
    updatedAt: new Date(row['updated_at'] as number),
  }
  for (const [key, attrSchema] of Object.entries(objectSchema.attributes)) {
    const val = sqlToValue(attrSchema, row[key])
    if (val !== undefined) record[key] = val
  }
  return record as RelateRecord
}

export function assertSafeKey(key: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
    throw new ValidationError({ message: `Invalid attribute key: "${key}"`, field: key })
  }
}

/** Double-quote a SQL identifier to safely escape reserved words. */
export function quoteId(name: string): string {
  return `"${name}"`
}
