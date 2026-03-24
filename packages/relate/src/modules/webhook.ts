import type { StorageAdapter } from '../adapter'
import { ValidationError } from '../errors'

const DEFAULT_WEBHOOK_LEASE_MS = 5 * 60 * 1000
const DEFAULT_WEBHOOK_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

export interface WebhookOptions {
  leaseMs?: number
}

export type WebhookResult<R> =
  | { executed: true; result: R }
  | { executed: false; reason: 'processed' | 'processing' }

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function requireWebhookSupport(
  adapter: StorageAdapter,
): asserts adapter is StorageAdapter & Required<Pick<StorageAdapter, 'claimWebhook' | 'completeWebhook' | 'failWebhook'>> {
  if (!adapter.claimWebhook || !adapter.completeWebhook || !adapter.failWebhook) {
    throw new Error('This adapter does not support webhook helpers')
  }
}

export async function executeWebhook<R>(
  adapter: StorageAdapter,
  externalId: string,
  handler: () => Promise<R> | R,
  options: WebhookOptions = {},
): Promise<WebhookResult<R>> {
  requireWebhookSupport(adapter)

  if (!externalId || externalId.trim() === '') {
    throw new ValidationError({
      code: 'VALIDATION_ERROR',
      field: 'externalId',
      message: 'Webhook externalId is required',
    })
  }

  const leaseMs = options.leaseMs ?? DEFAULT_WEBHOOK_LEASE_MS
  if (!Number.isFinite(leaseMs) || leaseMs <= 0) {
    throw new ValidationError({
      code: 'VALIDATION_ERROR',
      field: 'leaseMs',
      message: 'Webhook leaseMs must be a positive number',
    })
  }

  const claimedAtMs = Date.now()
  const claimToken = crypto.randomUUID()
  const claim = await adapter.claimWebhook({
    externalId,
    claimToken,
    claimedAtMs,
    leaseExpiresAtMs: claimedAtMs + leaseMs,
  })

  if (claim.status !== 'claimed') {
    return {
      executed: false,
      reason: claim.status,
    }
  }

  try {
    const result = await Promise.resolve(handler())
    await adapter.completeWebhook(externalId, claimToken, Date.now())
    return { executed: true, result }
  } catch (error) {
    await adapter.failWebhook(externalId, claimToken, Date.now(), errorMessage(error))
    throw error
  }
}

export async function cleanupWebhooks(
  adapter: StorageAdapter,
  before?: Date,
): Promise<void> {
  if (!adapter.cleanupWebhooks) {
    throw new Error('This adapter does not support webhook cleanup')
  }

  const processedBeforeMs = before ? before.getTime() : Date.now() - DEFAULT_WEBHOOK_RETENTION_MS
  await adapter.cleanupWebhooks(processedBeforeMs)
}
