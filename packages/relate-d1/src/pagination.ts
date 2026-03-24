import { ValidationError } from '@nokto-labs/relate'

export function normalizeNonNegativeInteger(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value === undefined) return undefined

  if (!Number.isInteger(value) || value < 0) {
    throw new ValidationError({
      message: `Invalid ${field}: expected a non-negative integer`,
      field,
      value,
    })
  }

  return value
}
