import type { AggregateRecordsOptions, AggregateRecordsResult, ObjectSchema } from '@nokto-labs/relate'
import type { D1Database } from '../d1-types'
import { parseFilterClauses } from '../filters'
import { tableName } from '../migrations'
import { assertSafeKey, sqlToValue } from '../utils'

export async function aggregateRecords(
  db: D1Database,
  objectSlug: string,
  objectSchema: ObjectSchema,
  options: AggregateRecordsOptions,
): Promise<AggregateRecordsResult> {
  const table = tableName(objectSlug)
  const clauses: string[] = []
  const bindings: unknown[] = []

  if (options.filter) {
    parseFilterClauses(options.filter, clauses, bindings, objectSchema)
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

  if (options.groupBy) {
    assertSafeKey(options.groupBy)
    const result = await db
      .prepare(
        `SELECT ${options.groupBy} as group_value, COUNT(*) as group_count FROM ${table} ${where} GROUP BY ${options.groupBy}`,
      )
      .bind(...bindings)
      .all<{ group_value: unknown; group_count: number }>()

    const groups: Record<string, number> = {}
    for (const row of result.results) {
      const normalized = sqlToValue(objectSchema.attributes[options.groupBy], row.group_value)
      const key = normalized === null || normalized === undefined
        ? 'null'
        : normalized instanceof Date
          ? normalized.toISOString()
          : String(normalized)
      groups[key] = row.group_count
    }

    return { groups }
  }

  const selectParts: string[] = []
  if (options.count) {
    selectParts.push('COUNT(*) as count')
  }
  if (options.sum) {
    assertSafeKey(options.sum.field)
    selectParts.push(`COALESCE(SUM(${options.sum.field}), 0) as sum`)
  }

  const row = await db
    .prepare(`SELECT ${selectParts.join(', ')} FROM ${table} ${where}`)
    .bind(...bindings)
    .first<{ count?: number; sum?: number }>()

  return {
    count: options.count ? row?.count ?? 0 : undefined,
    sum: options.sum ? row?.sum ?? 0 : undefined,
  }
}
