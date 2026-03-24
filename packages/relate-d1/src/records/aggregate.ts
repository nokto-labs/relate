import type { AggregateRecordsOptions, AggregateRecordsResult, ObjectSchema, SchemaInput, AttributeSchema } from '@nokto-labs/relate'
import { ValidationError } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { parseFilterClauses } from '../filters'
import { tableName } from '../migrations'
import { assertSafeKey, sqlToValue } from '../utils'

function attributeType(schema: AttributeSchema): string {
  return typeof schema === 'string' ? schema : schema.type
}

function normalizeGroupValue(
  objectSchema: ObjectSchema,
  field: string,
  value: unknown,
): string {
  const normalized = sqlToValue(objectSchema.attributes[field], value)
  if (normalized === null || normalized === undefined) return 'null'
  if (normalized instanceof Date) return normalized.toISOString()
  return String(normalized)
}

interface SumSelect {
  expression: string
  joinClause?: string
}

function resolveSumSelect(
  objectSlug: string,
  objectSchema: ObjectSchema,
  fullSchema: SchemaInput,
  field: string,
): SumSelect {
  const parts = field.split('.')

  if (parts.length === 1) {
    const sumSchema = objectSchema.attributes[field]
    if (!sumSchema || attributeType(sumSchema) !== 'number') {
      throw new ValidationError({
        code: 'INVALID_OPERATION',
        message: `Aggregate sum field "${field}" on "${objectSlug}" must be a number attribute`,
        object: objectSlug,
        field,
      })
    }
    assertSafeKey(field)
    return { expression: `base.${field}` }
  }

  if (parts.length !== 2) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${objectSlug}" must be a direct number field or a one-hop ref path`,
      object: objectSlug,
      field,
    })
  }

  const [refField, targetField] = parts
  assertSafeKey(refField)
  assertSafeKey(targetField)

  const refSchema = objectSchema.attributes[refField]
  if (!refSchema || typeof refSchema !== 'object' || refSchema.type !== 'ref') {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${objectSlug}" must start with a ref attribute`,
      object: objectSlug,
      field: refField,
    })
  }

  const targetSchema = fullSchema[refSchema.object]
  if (!targetSchema) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${objectSlug}" references unknown object "${refSchema.object}"`,
      object: objectSlug,
      field,
    })
  }

  const targetAttr = targetSchema.attributes[targetField]
  if (!targetAttr || attributeType(targetAttr) !== 'number') {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${objectSlug}" must end with a numeric attribute`,
      object: objectSlug,
      field: targetField,
    })
  }

  const joinAlias = `sum_ref_${refField}`
  return {
    expression: `${joinAlias}.${targetField}`,
    joinClause: `LEFT JOIN ${tableName(refSchema.object)} ${joinAlias} ON base.${refField} = ${joinAlias}.id`,
  }
}

export async function aggregateRecords(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  fullSchema: SchemaInput,
  options: AggregateRecordsOptions,
): Promise<AggregateRecordsResult> {
  const table = tableName(objectSlug)
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (options.filter) {
    parseFilterClauses(options.filter, clauses, bindings, objectSchema, 'base.')
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
  const sumSelect = options.sum
    ? resolveSumSelect(objectSlug, objectSchema, fullSchema, options.sum.field)
    : undefined
  const join = sumSelect?.joinClause ? `${sumSelect.joinClause} ` : ''

  if (options.groupBy) {
    assertSafeKey(options.groupBy)
    const selectParts = [`base.${options.groupBy} as group_value`]
    if (options.count) {
      selectParts.push('COUNT(*) as group_count')
    }
    if (sumSelect) {
      selectParts.push(`COALESCE(SUM(${sumSelect.expression}), 0) as group_sum`)
    }

    const result = await db
      .prepare(
        `SELECT ${selectParts.join(', ')} FROM ${table} base ${join}${where} GROUP BY base.${options.groupBy}`,
      )
      .bind(...bindings)
      .all<{ group_value: unknown; group_count?: number; group_sum?: number }>()

    const groups: Record<string, number> = {}
    const groupSums: Record<string, number> = {}
    for (const row of result.results) {
      const key = normalizeGroupValue(objectSchema, options.groupBy, row.group_value)
      if (options.count) {
        groups[key] = row.group_count ?? 0
      }
      if (sumSelect) {
        groupSums[key] = row.group_sum ?? 0
      }
    }

    return {
      groups: options.count ? groups : undefined,
      groupSums: sumSelect ? groupSums : undefined,
    }
  }

  const selectParts: string[] = []
  if (options.count) {
    selectParts.push('COUNT(*) as count')
  }
  if (sumSelect) {
    selectParts.push(`COALESCE(SUM(${sumSelect.expression}), 0) as sum`)
  }

  const row = await db
    .prepare(`SELECT ${selectParts.join(', ')} FROM ${table} base ${join}${where}`)
    .bind(...bindings)
    .first<{ count?: number; sum?: number }>()

  return {
    count: options.count ? row?.count ?? 0 : undefined,
    sum: options.sum ? row?.sum ?? 0 : undefined,
  }
}
