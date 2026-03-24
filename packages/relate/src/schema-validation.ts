import type { SchemaDefinition, SchemaInput, RefAttributeSchema, AttributeSchema } from './types'
import { InvalidSchemaError } from './errors'

export function isRefAttribute(schema: unknown): schema is RefAttributeSchema {
  return typeof schema === 'object' && schema !== null && 'type' in schema && (schema as { type: string }).type === 'ref'
}

const SAFE_IDENTIFIER = /^[a-z][a-z0-9_]*$/
const RESERVED_OBJECT_KEYS = new Set(['migrate', 'applyMigrations', 'relationships', 'activities', 'lists', 'on', 'off'])

function isSelectAttribute(schema: AttributeSchema): schema is Extract<AttributeSchema, { type: 'select' }> {
  return typeof schema === 'object' && schema !== null && 'type' in schema && schema.type === 'select'
}

function isSafeIdentifier(value: string): boolean {
  return SAFE_IDENTIFIER.test(value)
}

export function validateSchema(schema: SchemaDefinition): void {
  const objects = schema.objects
  const pluralToSlug = new Map<string, string>()

  for (const [slug, objectSchema] of Object.entries(objects)) {
    if (!isSafeIdentifier(slug)) {
      throw new InvalidSchemaError(
        `Invalid object slug "${slug}": use lowercase letters, numbers, and underscores only`,
      )
    }

    if (RESERVED_OBJECT_KEYS.has(slug)) {
      throw new InvalidSchemaError(`Invalid object slug "${slug}": this name is reserved by relate()`)
    }

    const plural = objectSchema.plural ?? `${slug}s`
    if (!isSafeIdentifier(plural)) {
      throw new InvalidSchemaError(
        `Invalid plural "${plural}" on "${slug}": use lowercase letters, numbers, and underscores only`,
      )
    }

    const existingPluralOwner = pluralToSlug.get(plural)
    if (existingPluralOwner && existingPluralOwner !== slug) {
      throw new InvalidSchemaError(
        `Invalid plural "${plural}": already used by object "${existingPluralOwner}"`,
      )
    }
    pluralToSlug.set(plural, slug)

    if (objectSchema.uniqueBy && !(objectSchema.uniqueBy in objectSchema.attributes)) {
      throw new InvalidSchemaError(
        `Invalid uniqueBy on "${slug}": attribute "${objectSchema.uniqueBy}" does not exist`,
      )
    }

    for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(attrName)) {
        throw new InvalidSchemaError(
          `Invalid attribute name "${slug}.${attrName}": use letters, numbers, and underscores only`,
        )
      }

      if (!isRefAttribute(attrSchema)) continue

      if (!objects[attrSchema.object]) {
        throw new InvalidSchemaError(
          `Invalid ref on "${slug}.${attrName}": target object "${attrSchema.object}" does not exist in schema`,
        )
      }

      if (attrSchema.onDelete === 'set_null' && attrSchema.required === true) {
        throw new InvalidSchemaError(
          `Invalid ref on "${slug}.${attrName}": onDelete "set_null" is not compatible with required: true`,
        )
      }
    }

    for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
      if (!isSelectAttribute(attrSchema)) continue

      if (!Array.isArray(attrSchema.options) || attrSchema.options.length === 0) {
        throw new InvalidSchemaError(
          `Invalid select on "${slug}.${attrName}": options must be a non-empty array`,
        )
      }

      const deduped = new Set(attrSchema.options)
      if (deduped.size !== attrSchema.options.length) {
        throw new InvalidSchemaError(
          `Invalid select on "${slug}.${attrName}": options must be unique`,
        )
      }
    }
  }

  for (const [type, relationship] of Object.entries(schema.relationships ?? {})) {
    if (!isSafeIdentifier(type)) {
      throw new InvalidSchemaError(
        `Invalid relationship type "${type}": use lowercase letters, numbers, and underscores only`,
      )
    }

    if (!objects[relationship.from]) {
      throw new InvalidSchemaError(
        `Invalid relationship "${type}": source object "${relationship.from}" does not exist in schema`,
      )
    }

    if (!objects[relationship.to]) {
      throw new InvalidSchemaError(
        `Invalid relationship "${type}": target object "${relationship.to}" does not exist in schema`,
      )
    }
  }
}
