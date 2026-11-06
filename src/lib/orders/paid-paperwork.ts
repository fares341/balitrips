/**
 * The customer's paperwork for a paid order — the `order_confirmation` email
 * and the voucher PDF — queued at the paid transition itself, inside the
 * transaction that records the money.
 *
 * Before this, only the reconcile sweep queued them, so a customer waited up
 * to one sweep interval for their confirmation. Now:
 *
 *  - The jobs are inserted through the transaction (pg-boss `db` option), so
 *    they exist exactly when the payment commits — never for a rolled-back
 *    payment, never lost after a committed one.
 *  - They use the same singleton keys and windows as the sweep's
 *    `sendThrottled` calls (`order_confirmation:<id>` / `voucher:<id>`), so a
 *    sweep that runs before the worker picks the job up queues nothing.
 *  - The email handler still checks `alreadySent` and the voucher handler
 *    skips an existing document, so even a job outside the window sends
 *    nothing twice.
 *  - Any failure is contained in a savepoint and logged: paperwork never
 *    rolls back a payment. The sweep remains the safety net.
 */

import { sql, type SQL } from 'drizzle-orm'

import type { db } from '@/db'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Same windows as `queueFollowUps` in src/worker/handlers/reconcile.ts. */
export const CONFIRMATION_THROTTLE_SECONDS = 15 * 60
export const VOUCHER_THROTTLE_SECONDS = 30 * 60

export function confirmationKey(orderId: string): string {
  return `order_confirmation:${orderId}`
}
export function voucherKey(orderId: string): string {
  return `voucher:${orderId}`
}

/** Minimal executor pg-boss accepts as `db`: runs its SQL on our transaction. */
export interface TxExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>
}

/** pg-boss writes `$1, $2…`; drizzle wants parameter chunks. */
export function toSql(text: string, values: readonly unknown[] = []): SQL {
  const parts = text.split(/\$(\d+)/)
  const chunks: SQL[] = []
  for (let i = 0; i < parts.length; i += 1) {
    if (i % 2 === 0) {
      const piece = parts[i] ?? ''
      if (piece !== '') chunks.push(sql.raw(piece))
    } else {
      chunks.push(sql`${values[Number(parts[i]) - 1]}`)
    }
  }
  return sql.join(chunks)
}

export function txExecutor(tx: Pick<Tx, 'execute'>): TxExecutor {
  return {
    async executeSql(text, values) {
      const result = await tx.execute(toSql(text, values))
      return { rows: Array.from(result as unknown as Iterable<unknown>) }
    },
  }
}

export interface PaperworkSender {
  send(
    queue: 'email' | 'pdf',
    data: object,
    options: { singletonKey: string; singletonSeconds: number; db: TxExecutor },
  ): Promise<string | null>
}

async function defaultSender(): Promise<PaperworkSender> {
  const { getBoss, QUEUES } = await import('@/worker/queues')
  const boss = await getBoss()
  return {
    send: (queue, data, options) =>
      boss.send(queue === 'email' ? QUEUES.email : QUEUES.pdf, data, {
        ...options,
        ...(queue === 'pdf' ? { group: { id: 'chromium' } } : {}),
      }),
  }
}

/**
 * Queue the confirmation email and the voucher for `orderId`. Never throws.
 * Returns how many jobs were created (0 when a singleton already existed).
 */
export async function queuePaidPaperwork(
  tx: Tx,
  orderId: string,
  sender?: PaperworkSender,
): Promise<number> {
  let created = 0
  try {
    const out = sender ?? (await defaultSender())
    // A savepoint: a failed insert must not abort the payment transaction.
    await tx.transaction(async (sp) => {
      const executor = txExecutor(sp)
      const email = await out.send(
        'email',
        { kind: 'order_confirmation', orderId },
        {
          singletonKey: confirmationKey(orderId),
          singletonSeconds: CONFIRMATION_THROTTLE_SECONDS,
          db: executor,
        },
      )
      const voucher = await out.send(
        'pdf',
        { kind: 'voucher', orderId },
        {
          singletonKey: voucherKey(orderId),
          singletonSeconds: VOUCHER_THROTTLE_SECONDS,
          db: executor,
        },
      )
      created = (email ? 1 : 0) + (voucher ? 1 : 0)
    })
  } catch (error) {
    console.error('[orders] could not queue paid-order paperwork; the sweep will', {
      orderId,
      error,
    })
    return 0
  }
  return created
}
