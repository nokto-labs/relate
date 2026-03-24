import type { AggregateRecordsOptions, AggregateRecordsResult, StorageAdapter } from '../adapter'
import type { AttributeSchema, FilterOperator, InferAttributes, ObjectSchema, RelateRecord, SchemaInput } from '../types'
import { ValidationError } from '../errors'

export type FilterInput<S extends ObjectSchema> = {
  [K in keyof InferAttributes<S>]?: InferAttributes<S>[K] | FilterOperator<InferAttributes<S>[K]>
}

type NumericAttributeKeys<S extends ObjectSchema> = {
  [K in keyof S['attributes']]:
    S['attributes'][K] extends 'number' | { type: 'number' } ? K : never
}[keyof S['attributes']] & string

type RefAggregateSumPath<S extends ObjectSchema, FullSchema extends SchemaInput> = {
  [K in keyof S['attributes']]:
    S['attributes'][K] extends { type: 'ref'; object: infer O extends keyof FullSchema & string }
      ? `${Extract<K, string>}.${NumericAttributeKeys<FullSchema[O]>}`
      : never
}[keyof S['attributes']] & string

export type AggregateInput<S extends ObjectSchema, FullSchema extends SchemaInput = SchemaInput> = {
  filter?: FilterInput<S>
  count?: boolean
  groupBy?: keyof InferAttributes<S> & string
  sum?: { field: NumericAttributeKeys<S> | RefAggregateSumPath<S, FullSchema> }
}

function attributeType(schema: ObjectSchema['attributes'][string]): string {
  return typeof schema === 'string' ? schema : schema.type
}

interface DirectSumField {
  kind: 'direct'
  field: string
}

interface RefSumField {
  kind: 'ref'
  field: string
  refField: string
  targetObject: string
  targetField: string
}

type ResolvedSumField = DirectSumField | RefSumField

function requireNumberAttribute(slug: string, field: string, schema?: AttributeSchema): void {
  if (!schema) {
    throw new ValidationError({
      message: `Unknown aggregate sum field "${field}" on "${slug}"`,
      object: slug,
      field,
    })
  }

  if (attributeType(schema) !== 'number') {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${slug}" must be a number attribute`,
      object: slug,
      field,
    })
  }
}

function resolveSumField(
  slug: string,
  schema: ObjectSchema,
  fullSchema: SchemaInput,
  field: string,
): ResolvedSumField {
  const parts = field.split('.')

  if (parts.length === 1) {
    requireNumberAttribute(slug, field, schema.attributes[field])
    return { kind: 'direct', field }
  }

  if (parts.length !== 2) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${slug}" must be a direct number field or a one-hop ref path`,
      object: slug,
      field,
    })
  }

  const [refField, targetField] = parts
  const refSchema = schema.attributes[refField]
  if (!refSchema || typeof refSchema !== 'object' || refSchema.type !== 'ref') {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${slug}" must start with a ref attribute`,
      object: slug,
      field: refField,
    })
  }

  const targetObject = refSchema.object
  const targetSchema = fullSchema[targetObject]
  if (!targetSchema) {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${field}" on "${slug}" references unknown object "${targetObject}"`,
      object: slug,
      field,
    })
  }

  requireNumberAttribute(targetObject, targetField, targetSchema.attributes[targetField])

  return {
    kind: 'ref',
    field,
    refField,
    targetObject,
    targetField,
  }
}

function groupKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (value === undefined || value === null) return 'null'
  return String(value)
}

function validateAggregateInput<S extends ObjectSchema, FullSchema extends SchemaInput>(
  slug: string,
  schema: S,
  fullSchema: FullSchema,
  options: AggregateInput<S, FullSchema>,
): { aggregateOptions: AggregateRecordsOptions; resolvedSum?: ResolvedSumField } {
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

  if (groupBy && !(groupBy in schema.attributes)) {
    throw new ValidationError({
      message: `Unknown aggregate groupBy attribute "${groupBy}" on "${slug}"`,
      object: slug,
      field: groupBy,
    })
  }

  const resolvedSum = sumField
    ? resolveSumField(slug, schema, fullSchema, sumField)
    : undefined

  if (sumField) {
    // resolved above for validation side effects
  }

  return {
    aggregateOptions: {
      filter: options.filter as Record<string, unknown> | undefined,
      count,
      groupBy,
      sum: sumField ? { field: sumField } : undefined,
    },
    resolvedSum,
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
    const groupSums: Record<string, number> = {}
    for (const record of records) {
      const key = groupKey((record as Record<string, unknown>)[options.groupBy])
      groups[key] = (groups[key] ?? 0) + 1

      if (!options.sum) continue

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
      groupSums[key] = (groupSums[key] ?? 0) + value
    }
    result.groups = groups
    if (options.sum) {
      result.groupSums = groupSums
    }
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

export async function aggregateObjectRecords<S extends ObjectSchema, FullSchema extends SchemaInput>(
  adapter: StorageAdapter,
  slug: string,
  schema: S,
  fullSchema: FullSchema,
  options: AggregateInput<S, FullSchema>,
): Promise<AggregateRecordsResult> {
  const { aggregateOptions, resolvedSum } = validateAggregateInput(slug, schema, fullSchema, options)

  if (adapter.aggregateRecords) {
    return adapter.aggregateRecords(slug, aggregateOptions)
  }

  if (resolvedSum?.kind === 'ref') {
    throw new ValidationError({
      code: 'INVALID_OPERATION',
      message: `Aggregate sum field "${resolvedSum.field}" on "${slug}" requires native adapter aggregate support`,
      object: slug,
      field: resolvedSum.field,
    })
  }

  warnForJavascriptFallback(slug)

  const records = await adapter.findRecords(slug, { filter: aggregateOptions.filter })
  return applyJavascriptAggregate(slug, records, aggregateOptions)
}
