import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { createD1TestDB, resetDB, cleanup } from './helpers'

beforeEach(resetDB)
afterAll(cleanup)

describe('db.webhook (D1)', () => {
  it('executes once and skips processed duplicates', async () => {
    const { db, d1 } = await createD1TestDB()
    const handler = vi.fn(async () => {
      await db.person.create({ email: 'alice@test.com' })
      return 'processed'
    })

    await expect(db.webhook('evt_1', handler)).resolves.toEqual({
      executed: true,
      result: 'processed',
    })
    await expect(db.webhook('evt_1', handler)).resolves.toEqual({
      executed: false,
      reason: 'processed',
    })

    const row = await d1
      .prepare('SELECT processed_at, attempt_count FROM relate_webhooks WHERE external_id = ?')
      .bind('evt_1')
      .first<{ processed_at: number | null; attempt_count: number }>()

    expect(handler).toHaveBeenCalledTimes(1)
    expect(row?.processed_at).not.toBeNull()
    expect(row?.attempt_count).toBe(1)
  })

  it('records failures and allows a later retry to succeed', async () => {
    const { db, d1 } = await createD1TestDB()

    await expect(
      db.webhook('evt_retry', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    const failed = await d1
      .prepare('SELECT processed_at, last_error, attempt_count, claim_token FROM relate_webhooks WHERE external_id = ?')
      .bind('evt_retry')
      .first<{ processed_at: number | null; last_error: string | null; attempt_count: number; claim_token: string | null }>()

    expect(failed).toMatchObject({
      processed_at: null,
      last_error: 'boom',
      attempt_count: 1,
      claim_token: null,
    })

    await expect(
      db.webhook('evt_retry', async () => {
        await db.person.create({ email: 'retry@test.com' })
        return 'ok'
      }),
    ).resolves.toEqual({
      executed: true,
      result: 'ok',
    })

    const retried = await d1
      .prepare('SELECT processed_at, last_error, attempt_count FROM relate_webhooks WHERE external_id = ?')
      .bind('evt_retry')
      .first<{ processed_at: number | null; last_error: string | null; attempt_count: number }>()

    expect(retried?.processed_at).not.toBeNull()
    expect(retried?.last_error).toBeNull()
    expect(retried?.attempt_count).toBe(2)
  })

  it('skips execution while another claim lease is still active', async () => {
    const { db, d1 } = await createD1TestDB()
    const now = Date.now()

    await d1
      .prepare(
        `INSERT INTO relate_webhooks
         (external_id, claim_token, claimed_at, lease_expires_at, processed_at, last_error, attempt_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, NULL, 1, ?, ?)`,
      )
      .bind('evt_busy', 'busy-token', now, now + 60_000, now, now)
      .run()

    const handler = vi.fn(async () => 'nope')

    await expect(db.webhook('evt_busy', handler)).resolves.toEqual({
      executed: false,
      reason: 'processing',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('cleans up processed webhook rows explicitly', async () => {
    const { db, d1 } = await createD1TestDB()
    const old = Date.now() - (40 * 24 * 60 * 60 * 1000)

    await d1
      .prepare(
        `INSERT INTO relate_webhooks
         (external_id, claim_token, claimed_at, lease_expires_at, processed_at, last_error, attempt_count, created_at, updated_at)
         VALUES (?, NULL, ?, NULL, ?, NULL, 1, ?, ?)`,
      )
      .bind('evt_old', old, old, old, old)
      .run()

    await db.cleanupWebhooks()

    const row = await d1
      .prepare('SELECT external_id FROM relate_webhooks WHERE external_id = ?')
      .bind('evt_old')
      .first<{ external_id: string }>()

    expect(row).toBeNull()
  })
})
