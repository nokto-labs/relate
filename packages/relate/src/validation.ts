import type { ObjectSchema, AttributeSchema } from './types'
import { ValidationError } from './errors'

interface ValidationOptions {
  partial?: boolean
}

function isRequired(schema: AttributeSchema): boolean {
  return typeof schema === 'object' && 'required' in schema && schema.required === true
}

function attributeType(schema: AttributeSchema): string {
  return typeof schema === 'string' ? schema : schema.type
}

function assertValidValue(
  objectSlug: string,
  key: string,
  schema: AttributeSchema,
  value: unknown,
): void {
  if (value === undefined || value === null) return

  const type = attributeType(schema)

  switch (type) {
    case 'text':
    case 'email':
    case 'url':
      if (typeof value !== 'string') {
        throw new ValidationError({
          message: `Invalid value for attribute "${key}" on "${objectSlug}": expected ${type}`,
          object: objectSlug,
          field: key,
          expected: type,
        })
      }
      return
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new ValidationError({
          message: `Invalid value for attribute "${key}" on "${objectSlug}": expected number`,
          object: objectSlug,
          field: key,
          expected: 'number',
        })
      }
      return
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new ValidationError({
          message: `Invalid value for attribute "${key}" on "${objectSlug}": expected boolean`,
          object: objectSlug,
          field: key,
          expected: 'boolean',
        })
      }
      return
    case 'date': {
      const timestamp = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime()
      if (Number.isNaN(timestamp)) {
        throw new ValidationError({
          message: `Invalid value for attribute "${key}" on "${objectSlug}": expected date`,
          object: objectSlug,
          field: key,
          expected: 'date',
        })
      }
      return
    }
    case 'select': {
      const options = typeof schema === 'object' && 'options' in schema ? schema.options : []
      if (typeof value !== 'string' || !options.includes(value)) {
        throw new ValidationError({
          message: `Invalid value for attribute "${key}" on "${objectSlug}": expected one of ${options.join(', ')}`,
          object: objectSlug,
          field: key,
          expected: 'select',
          options,
        })
      }
      return
    }
    default:
      return
  }
}

export function validateAttributes(
  objectSlug: string,
  schema: ObjectSchema,
  attributes: Record<string, unknown>,
  options: ValidationOptions = {},
): void {
  for (const key of Object.keys(attributes)) {
    if (!(key in schema.attributes)) {
      throw new ValidationError({
        message: `Unknown attribute "${key}" on "${objectSlug}"`,
        object: objectSlug,
        field: key,
      })
    }
  }

  if (!options.partial) {
    for (const [key, attrSchema] of Object.entries(schema.attributes)) {
      if (!isRequired(attrSchema)) continue

      const value = attributes[key]
      if (value === undefined || value === null || value === '') {
        throw new ValidationError({
          message: `Missing required attribute "${key}" on "${objectSlug}"`,
          object: objectSlug,
          field: key,
        })
      }
    }
  }

  for (const [key, value] of Object.entries(attributes)) {
    const attrSchema = schema.attributes[key]
    if (!attrSchema) continue

    if (isRequired(attrSchema) && (value === null || value === '')) {
      throw new ValidationError({
        message: `Missing required attribute "${key}" on "${objectSlug}"`,
        object: objectSlug,
        field: key,
      })
    }

    assertValidValue(objectSlug, key, attrSchema, value)
  }
}
