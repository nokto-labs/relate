import type { ObjectSchema } from '@nokto-labs/relate'
import { FILTER_OPERATORS, ValidationError } from '@nokto-labs/relate'
import { assertSafeKey, filterValueToSql } from './utils'

const VALID_OPS = new Set<string>(FILTER_OPERATORS)
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
  columnPrefix = '',
): void {
  // Keep SQL compilation aligned with the shared runtime matcher in
  // `packages/relate/src/filters.ts`, which powers non-SQL checks such as
  // scoped Hono `get/update/delete` route filtering.
  for (const [key, value] of Object.entries(filter)) {
    assertSafeKey(key)
    const attrSchema = objectSchema?.attributes[key]
    const column = `${columnPrefix}${key}`

    if (objectSchema && !attrSchema) {
      throw new ValidationError({ message: `Unknown filter attribute "${key}"`, field: key })
    }

    if (value === null) {
      clauses.push(`${column} IS NULL`)
      continue
    }

    if (value === undefined || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) {
      clauses.push(`${column} = ?`)
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
        const hasNull = arr.some((entry) => entry === null)
        const nonNullEntries = arr.filter((entry) => entry !== null)

        if (arr.length === 0) {
          clauses.push('0')
        } else if (nonNullEntries.length === 0 && hasNull) {
          clauses.push(`${column} IS NULL`)
        } else {
          const inClause = `${column} IN (${nonNullEntries.map(() => '?').join(', ')})`
          if (hasNull) {
            clauses.push(`(${inClause} OR ${column} IS NULL)`)
          } else {
            clauses.push(inClause)
          }
          bindings.push(...nonNullEntries.map((entry) => (attrSchema ? filterValueToSql(attrSchema, entry, key) : entry)))
        }
      } else if (op === 'like') {
        if (attrSchema) {
          const type = typeof attrSchema === 'string' ? attrSchema : attrSchema.type
          if (!['text', 'email', 'url', 'select', 'ref'].includes(type)) {
            throw new ValidationError({ message: `Operator "like" is not supported for attribute "${key}"`, field: key })
          }
        }
        clauses.push(`${column} ${OP_TO_SQL[op]} ?`)
        bindings.push(opValue)
      } else if (op === 'eq' && opValue === null) {
        clauses.push(`${column} IS NULL`)
      } else if (op === 'ne' && opValue === null) {
        clauses.push(`${column} IS NOT NULL`)
      } else {
        clauses.push(`${column} ${OP_TO_SQL[op]} ?`)
        bindings.push(attrSchema ? filterValueToSql(attrSchema, opValue, key) : opValue)
      }
    }

    if (!hasOps) {
      clauses.push(`${column} = ?`)
      bindings.push(attrSchema ? filterValueToSql(attrSchema, value, key) : value)
    }
  }
}
