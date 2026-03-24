import { ValidationError } from '@nokto-labs/relate'

function parseNonNegativeInteger(raw: string | undefined, field: string): number | undefined {
  if (raw === undefined) return undefined
  if (!/^\d+$/.test(raw)) {
    throw new ValidationError({
      message: `Invalid ${field}: expected a non-negative integer`,
      field,
      value: raw,
    })
  }

  const value = Number(raw)
  if (!Number.isSafeInteger(value)) {
    throw new ValidationError({
      message: `Invalid ${field}: expected a safe integer`,
      field,
      value: raw,
    })
  }

  return value
}

/**
 * Cap the requested limit to the configured maxLimit.
 * If no limit is requested, defaults to maxLimit.
 * If no maxLimit is configured, returns the requested limit as-is.
 */
export function capLimit(requested: string | undefined, maxLimit: number | undefined): number | undefined {
  const parsedRequested = parseNonNegativeInteger(requested, 'limit')
  if (maxLimit === undefined) return parsedRequested
  if (parsedRequested === undefined) return maxLimit
  return Math.min(parsedRequested, maxLimit)
}

export function parseOffset(offset: string | undefined): number | undefined {
  return parseNonNegativeInteger(offset, 'offset')
}

export function parseDateQuery(value: string | undefined, field: string): Date | undefined {
  if (value === undefined) return undefined

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError({
      message: `Invalid ${field}: expected an ISO date or timestamp`,
      field,
      value,
    })
  }

  return parsed
}

export function validateMaxLimit(maxLimit: number | undefined): number | undefined {
  if (maxLimit === undefined) return undefined
  if (!Number.isInteger(maxLimit) || maxLimit < 0) {
    throw new ValidationError({
      message: 'Invalid maxLimit: expected a non-negative integer',
      field: 'maxLimit',
      value: maxLimit,
    })
  }

  return maxLimit
}
