import type { SchemaInput, RefAttributeSchema } from './types'
import { InvalidSchemaError } from './errors'

export function isRefAttribute(schema: unknown): schema is RefAttributeSchema {
  return typeof schema === 'object' && schema !== null && 'type' in schema && (schema as { type: string }).type === 'ref'
}

export function validateSchema(objects: SchemaInput): void {
  for (const [slug, objectSchema] of Object.entries(objects)) {
    for (const [attrName, attrSchema] of Object.entries(objectSchema.attributes)) {
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
  }
}
