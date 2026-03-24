import { describe, it, expect, vi } from 'vitest'
import { createTestDB } from './helpers'

describe('db.webhook', () => {
  it('executes the handler once and skips already processed duplicates', async () => {
    const { db } = createTestDB()
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

    expect(handler).toHaveBeenCalledTimes(1)
    expect(await db.person.count()).toBe(1)
  })

  it('releases failed executions so a later retry can run', async () => {
    const { db } = createTestDB()

    await expect(
      db.webhook('evt_retry', async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')

    await expect(
      db.webhook('evt_retry', async () => {
        await db.person.create({ email: 'retry@test.com' })
        return 'ok'
      }),
    ).resolves.toEqual({
      executed: true,
      result: 'ok',
    })

    expect(await db.person.count()).toBe(1)
  })

  it('skips execution while another claim is still active', async () => {
    const { db, adapter } = createTestDB()
    await adapter.claimWebhook?.({
      externalId: 'evt_busy',
      claimToken: 'busy-token',
      claimedAtMs: Date.now(),
      leaseExpiresAtMs: Date.now() + 60_000,
    })

    const handler = vi.fn(async () => 'nope')

    await expect(db.webhook('evt_busy', handler)).resolves.toEqual({
      executed: false,
      reason: 'processing',
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('cleans up processed webhook records explicitly', async () => {
    const { db } = createTestDB()

    await db.webhook('evt_cleanup', async () => 'done')
    await db.cleanupWebhooks(new Date(Date.now() + 1_000))

    await expect(db.webhook('evt_cleanup', async () => 'rerun')).resolves.toEqual({
      executed: true,
      result: 'rerun',
    })
  })
})
