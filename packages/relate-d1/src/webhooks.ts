import type { ClaimWebhookInput, WebhookClaimResult, WebhookExecution } from '@nokto-labs/relate'
import type { D1Database } from './d1-types'

interface WebhookRow {
  external_id: string
  claim_token: string | null
  claimed_at: number
  lease_expires_at: number | null
  processed_at: number | null
  last_error: string | null
  attempt_count: number
  created_at: number
  updated_at: number
}

function rowToWebhookExecution(row: WebhookRow): WebhookExecution {
  return {
    externalId: row.external_id,
    claimedAt: new Date(row.claimed_at),
    leaseExpiresAt: row.lease_expires_at === null ? undefined : new Date(row.lease_expires_at),
    processedAt: row.processed_at === null ? undefined : new Date(row.processed_at),
    lastError: row.last_error ?? undefined,
    attemptCount: row.attempt_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

// Compare the stored lease against the incoming claim time rather than a SQL clock.
// D1 does not give us a trustworthy server-side millisecond timestamp, so the new
// caller's claimedAtMs is the only consistent "is this lease still active for me?"
// value we can use inside the upsert.
const ACTIVE_CLAIM_CONDITION = `
  relate_webhooks.processed_at IS NULL
  AND relate_webhooks.claim_token IS NOT NULL
  AND relate_webhooks.lease_expires_at IS NOT NULL
  AND relate_webhooks.lease_expires_at >= excluded.claimed_at
`

export async function claimWebhook(
  db: D1Database,
  input: ClaimWebhookInput,
): Promise<WebhookClaimResult> {
  const row = await db.prepare(
    `INSERT INTO relate_webhooks (
      external_id,
      claim_token,
      claimed_at,
      lease_expires_at,
      processed_at,
      last_error,
      attempt_count,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, NULL, NULL, 1, ?, ?)
    ON CONFLICT(external_id) DO UPDATE SET
      claim_token = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.claim_token
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.claim_token
        ELSE excluded.claim_token
      END,
      claimed_at = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.claimed_at
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.claimed_at
        ELSE excluded.claimed_at
      END,
      lease_expires_at = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.lease_expires_at
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.lease_expires_at
        ELSE excluded.lease_expires_at
      END,
      last_error = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.last_error
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.last_error
        ELSE NULL
      END,
      attempt_count = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.attempt_count
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.attempt_count
        ELSE relate_webhooks.attempt_count + 1
      END,
      updated_at = CASE
        WHEN relate_webhooks.processed_at IS NOT NULL THEN relate_webhooks.updated_at
        WHEN ${ACTIVE_CLAIM_CONDITION} THEN relate_webhooks.updated_at
        ELSE excluded.updated_at
      END
    RETURNING external_id, claim_token, claimed_at, lease_expires_at, processed_at, last_error, attempt_count, created_at, updated_at`,
  )
    .bind(
      input.externalId,
      input.claimToken,
      input.claimedAtMs,
      input.leaseExpiresAtMs,
      input.claimedAtMs,
      input.claimedAtMs,
    )
    .first<WebhookRow>()

  if (!row) {
    throw new Error(`Failed to claim webhook "${input.externalId}"`)
  }

  const execution = rowToWebhookExecution(row)
  if (row.processed_at !== null) {
    return { status: 'processed', execution }
  }

  if (row.claim_token === input.claimToken) {
    return { status: 'claimed', execution }
  }

  return { status: 'processing', execution }
}

export async function completeWebhook(
  db: D1Database,
  externalId: string,
  claimToken: string,
  processedAtMs: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE relate_webhooks
       SET processed_at = ?, claim_token = NULL, lease_expires_at = NULL, last_error = NULL, updated_at = ?
       WHERE external_id = ? AND claim_token = ?`,
    )
    .bind(processedAtMs, processedAtMs, externalId, claimToken)
    .run()
}

export async function failWebhook(
  db: D1Database,
  externalId: string,
  claimToken: string,
  failedAtMs: number,
  errorMessage: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE relate_webhooks
       SET claim_token = NULL, lease_expires_at = NULL, last_error = ?, updated_at = ?
       WHERE external_id = ? AND claim_token = ?`,
    )
    .bind(errorMessage, failedAtMs, externalId, claimToken)
    .run()
}

export async function cleanupWebhooks(
  db: D1Database,
  processedBeforeMs: number,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM relate_webhooks
       WHERE processed_at IS NOT NULL AND processed_at < ?`,
    )
    .bind(processedBeforeMs)
    .run()
}
