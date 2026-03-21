import type { SchemaDefinition } from './types'

/**
 * Define your CRM schema. Pass this to `createCRM` to get fully typed object clients.
 *
 * @example
 * const schema = defineSchema({
 *   objects: {
 *     person: {
 *       attributes: {
 *         email: { type: 'email', required: true },
 *         name: 'text',
 *       },
 *       uniqueBy: 'email',
 *     },
 *     company: {
 *       attributes: { domain: { type: 'text', required: true }, name: 'text' },
 *       uniqueBy: 'domain',
 *     },
 *   },
 *   relationships: {
 *     works_at: { from: 'person', to: 'company' },
 *   },
 * })
 */
export function defineSchema<T extends SchemaDefinition>(schema: T): T {
  return schema
}
