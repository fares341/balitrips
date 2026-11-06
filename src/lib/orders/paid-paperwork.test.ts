import { PgDialect } from 'drizzle-orm/pg-core'
import { describe, expect, it, vi } from 'vitest'

import {
  confirmationKey,
  queuePaidPaperwork,
  toSql,
  voucherKey,
  type PaperworkSender,
} from './paid-paperwork'

vi.mock('@/db', () => ({ db: {} }))

/** A fake transaction whose savepoint just runs the callback. */
function fakeTx() {
  const tx = {
    execute: vi.fn(async () => []),
    transaction: vi.fn(async (run: (sp: unknown) => Promise<unknown>) => run(tx)),
  }
  return tx
}

/** pg-boss singleton semantics: one job per key per window. */
function singletonSender(): PaperworkSender & { jobs: Array<{ queue: string; key: string }> } {
  const seen = new Set<string>()
  const jobs: Array<{ queue: string; key: string }> = []
  return {
    jobs,
    async send(queue, _data, options) {
      if (seen.has(options.singletonKey)) return null
      seen.add(options.singletonKey)
      jobs.push({ queue, key: options.singletonKey })
      return `job-${jobs.length}`
    },
  }
}

describe('queuePaidPaperwork', () => {
  it('queues the confirmation email and the voucher once, with the sweep’s keys', async () => {
    const sender = singletonSender()
    const send = vi.spyOn(sender, 'send')
    const tx = fakeTx()

    const created = await queuePaidPaperwork(tx as never, 'o1', sender)

    expect(created).toBe(2)
    expect(send).toHaveBeenCalledWith(
      'email',
      { kind: 'order_confirmation', orderId: 'o1' },
      expect.objectContaining({ singletonKey: 'order_confirmation:o1', singletonSeconds: 900 }),
    )
    expect(send).toHaveBeenCalledWith(
      'pdf',
      { kind: 'voucher', orderId: 'o1' },
      expect.objectContaining({ singletonKey: 'voucher:o1', singletonSeconds: 1800 }),
    )
    // Inside a savepoint of the payment transaction.
    expect(tx.transaction).toHaveBeenCalledTimes(1)
  })

  it('a replay (webhook retry, reconcile promotion) queues nothing more', async () => {
    const sender = singletonSender()
    await queuePaidPaperwork(fakeTx() as never, 'o1', sender)
    const again = await queuePaidPaperwork(fakeTx() as never, 'o1', sender)
    expect(again).toBe(0)
    expect(sender.jobs).toHaveLength(2)
    expect(sender.jobs.filter((job) => job.key === confirmationKey('o1'))).toHaveLength(1)
  })

  it('uses the same keys as the reconcile sweep', () => {
    // src/worker/handlers/reconcile.ts throttles on these exact strings.
    expect(confirmationKey('abc')).toBe('order_confirmation:abc')
    expect(voucherKey('abc')).toBe('voucher:abc')
  })

  it('never throws into the payment transaction', async () => {
    const sender: PaperworkSender = { send: vi.fn().mockRejectedValue(new Error('queue down')) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(queuePaidPaperwork(fakeTx() as never, 'o1', sender)).resolves.toBe(0)
  })
})

describe('toSql', () => {
  it('turns pg-boss $n placeholders into bound parameters, reusing repeats', () => {
    const query = new PgDialect().sqlToQuery(
      toSql('insert into t values ($1, $2) returning $1', ['a', 2]),
    )
    expect(query.sql).toBe('insert into t values ($1, $2) returning $3')
    expect(query.params).toEqual(['a', 2, 'a'])
  })
})
