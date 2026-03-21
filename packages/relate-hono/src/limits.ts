/**
 * Cap the requested limit to the configured maxLimit.
 * If no limit is requested, defaults to maxLimit.
 * If no maxLimit is configured, returns the requested limit as-is.
 */
export function capLimit(requested: number | undefined, maxLimit: number | undefined): number | undefined {
  if (!maxLimit) return requested
  if (!requested) return maxLimit
  return Math.min(requested, maxLimit)
}
