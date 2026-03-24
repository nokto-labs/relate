import type { AggregateRecordsOptions, AggregateRecordsResult, StorageAdapter } from '../adapter'
import type { FilterOperator, InferAttributes, ObjectSchema, RelateRecord } from '../types'
import { ValidationError } from '../errors'

export type FilterInput<S extends ObjectSchema> = {
  [K in keyof InferAttributes<S>]?: InferAttributes<S>[K] | FilterOperator<InferAttributes<S>[K]>
}

export type AggregateInput<S extends ObjectSchema> = {
  filter?: FilterInput<S>
  count?: boolean
  groupBy?: keyof InferAttributes<S> & string
  sum?: { field: keyof InferAttributes<S> & string }
}

function attributeType(schema: ObjectSchema['attributes'][string]): string {
  return typeof schema === 'string' ? schema : schema.type
}

function groupKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined || value === null) return 'null'
  return String(value)
}

function validateAggregateInput<S extends ObjectSchema>(
  slug: string,
  schema: S,
  options: AggregateInput<S>,
): AggregateRecordsOptions {
  const count = options.count === true
  const groupBy = options.groupBy as string | undefined
  const sumField = options.sum?.field as string | undefined

  if (!count && !sumField) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate on "${slug}" requires count: true or sum.field`,
      object: slug,
    })
  }

  if (groupBy && !count) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate on "${slug}" requires count: true when groupBy is used`,
      object: slug,
      field: groupBy,
    })
  }

  if (groupBy && sumField) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate on "${slug}" does not support groupBy together with sum in v1`,
      object: slug,
      field: groupBy,
    })
  }

  if (groupBy && !(groupBy in schema.attributes)) {
    throw new ValidationError({
      message: `Unknown aggregate groupBy attribute "${groupBy}" on "${slug}"`,
      object: slug,
      field: groupBy,
    })
  }

  if (sumField) {
    const sumSchema = schema.attributes[sumField]
    if (!sumSchema) {
      throw new ValidationError({
        message: `Unknown aggregate sum field "${sumField}" on "${slug}"`,
        object: slug,
        field: sumField,
      })
    }

    if (attributeType(sumSchema) !== 'number') {
      throw new ValidationError({
        code: 'INVALID_OPERATION',
        message: `Aggregate sum field "${sumField}" on "${slug}" must be a number attribute`,
        object: slug,
        field: sumField,
      })
    }
  }

  return {
    filter: options.filter as Record<string, unknown> | undefined,
    count,
    groupBy,
    sum: sumField ? { field: sumField } : undefined,
  }
}

function warnForJavascriptFallback(slug: string): void {
  console.warn(
    `[relate] Falling back to JavaScript aggregate for "${slug}" because this adapter does not implement aggregateRecords(). This may load many records into memory.`,
  )
}

function applyJavascriptAggregate(
  slug: string,
  records: RelateRecord[],
  options: AggregateRecordsOptions,
): AggregateRecordsResult {
  const result: AggregateRecordsResult = {}

  if (options.groupBy) {
    const groups: Record<string, number> = {}
    for (const record of records) {
      const key = groupKey((record as Record<string, unknown>)[options.groupBy])
      groups[key] = (groups[key] ?? 0) + 1
    }
    result.groups = groups
    return result
  }

  if (options.count) {
    result.count = records.length
  }

  if (options.sum) {
    let total = 0
    for (const record of records) {
      const value = (record as Record<string, unknown>)[options.sum.field]
      if (value === undefined || value === null) continue
      if (typeof value !== 'number') {
        throw new ValidationError({
          code: 'INVALID_OPERATION',
          message: `Aggregate sum field "${options.sum.field}" on "${slug}" returned a non-number value`,
          object: slug,
          field: options.sum.field,
        })
      }
      total += value
    }
    result.sum = total
  }

  return result
}

export async function aggregateObjectRecords<S extends ObjectSchema>(
  adapter: StorageAdapter,
  slug: string,
  schema: S,
  options: AggregateInput<S>,
): Promise<AggregateRecordsResult> {
  const aggregateOptions = validateAggregateInput(slug, schema, options)

  if (adapter.aggregateRecords) {
    return adapter.aggregateRecords(slug, aggregateOptions)
  }

  warnForJavascriptFallback(slug)

  const records = await adapter.findRecords(slug, { filter: aggregateOptions.filter })
  return applyJavascriptAggregate(slug, records, aggregateOptions)
}
