import type { ObjectSchema } from '@nokto-labs/relate'
import { ValidationError } from '@nokto-labs/relate'
import { assertSafeKey, filterValueToSql } from './utils'

const VALID_OPS = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like'])
const OP_TO_SQL: Record<string, string> = {
  eq: '=',
  ne: '!=',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
}

export function parseFilterClauses(
  filter: Record<string, unknown>,
  clauses: string[],
  bindings: unknown[],
  objectSchema?: ObjectSchema,
): void {
  for (const [key, value] of Object.entries(filter)) {
    assertSafeKey(key)
    const attrSchema = objectSchema?.attributes[key]

    if (objectSchema && !attrSchema) {
      throw new ValidationError({ message: `Unknown filter attribute "${key}"`, field: key })
    }

    if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) {
      clauses.push(`${key} = ?`)
      bindings.push(attrSchema ? filterValueToSql(attrSchema, value, key) : value)
      continue
    }

    const ops = value as Record<string, unknown>
    let hasOps = false
    for (const [op, opValue] of Object.entries(ops)) {
      if (!VALID_OPS.has(op)) continue
      hasOps = true

      if (op === 'in') {
        const arr = opValue as unknown[]
        if (arr.length === 0) {
          clauses.push('0')
        } else {
          clauses.push(`${key} IN (${arr.map(() => '?').join(', ')})`)
          bindings.push(...arr.map((entry) => (attrSchema ? filterValueToSql(attrSchema, entry, key) : entry)))
        }
      } else if (op === 'like') {
        if (attrSchema) {
          const type = typeof attrSchema === 'string' ? attrSchema : attrSchema.type
          if (!['text', 'email', 'url', 'select', 'ref'].includes(type)) {
            throw new ValidationError({ message: `Operator "like" is not supported for attribute "${key}"`, field: key })
          }
        }
        clauses.push(`${key} ${OP_TO_SQL[op]} ?`)
        bindings.push(opValue)
      } else {
        clauses.push(`${key} ${OP_TO_SQL[op]} ?`)
        bindings.push(attrSchema ? filterValueToSql(attrSchema, opValue, key) : opValue)
      }
    }

    if (!hasOps) {
      clauses.push(`${key} = ?`)
      bindings.push(attrSchema ? filterValueToSql(attrSchema, value, key) : value)
    }
  }
}
