const FILTER_OPERATOR_SET = new Set(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like'] as const)

export const FILTER_OPERATORS = [...FILTER_OPERATOR_SET]

type FilterOperatorName = typeof FILTER_OPERATORS[number]

export function isFilterOperatorObject(value: unknown): value is Partial<Record<FilterOperatorName, unknown>> {
  if (value === null || value === undefined || typeof value !== 'object' || value instanceof Date || Array.isArray(value)) {
    return false
  }

  return Object.keys(value).some((key) => FILTER_OPERATOR_SET.has(key as FilterOperatorName))
}

function toComparable(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value
}

function toNullableComparable(value: unknown): unknown {
  if (value === undefined) return null
  return toComparable(value)
}

function escapeLikePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesLike(actual: unknown, pattern: string): boolean {
  if (typeof actual !== 'string') return false
  const regex = new RegExp(`^${escapeLikePattern(pattern).replace(/%/g, '.*').replace(/_/g, '.')}$`)
  return regex.test(actual)
}

export function matchesFilter(record: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, expected] of Object.entries(filter)) {
    const actual = record[key]

    if (!isFilterOperatorObject(expected)) {
      if (toNullableComparable(actual) !== toNullableComparable(expected)) return false
      continue
    }

    for (const [op, opValue] of Object.entries(expected)) {
      if (!FILTER_OPERATOR_SET.has(op as FilterOperatorName)) continue

      const comparableActual = toComparable(actual)
      const comparableExpected = toComparable(opValue)
      const nullableComparableActual = toNullableComparable(actual)
      const nullableComparableExpected = toNullableComparable(opValue)

      if (op === 'eq' && nullableComparableActual !== nullableComparableExpected) return false
      if (op === 'ne' && nullableComparableActual === nullableComparableExpected) return false
      if (op === 'gt' && !(comparableActual! > comparableExpected!)) return false
      if (op === 'gte' && !(comparableActual! >= comparableExpected!)) return false
      if (op === 'lt' && !(comparableActual! < comparableExpected!)) return false
      if (op === 'lte' && !(comparableActual! <= comparableExpected!)) return false
      if (op === 'in') {
        const values = Array.isArray(opValue) ? opValue.map((value) => toNullableComparable(value)) : []
        if (!values.includes(nullableComparableActual)) return false
      }
      if (op === 'like' && !matchesLike(actual, String(opValue))) return false
    }
  }

  return true
}

export function mergeFilters(
  ...filters: Array<Record<string, unknown> | undefined>
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {}

  for (const source of filters) {
    if (!source) continue

    for (const [key, value] of Object.entries(source)) {
      const existing = merged[key]
      if (isFilterOperatorObject(existing) && isFilterOperatorObject(value)) {
        merged[key] = { ...existing, ...value }
      } else {
        merged[key] = value
      }
    }
  }

  return Object.keys(merged).length > 0 ? merged : undefined
}
