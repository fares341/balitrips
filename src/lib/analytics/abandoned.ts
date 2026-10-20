import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { checkoutReminders } from '@/db/schema'

import type { MarketingSettings } from './settings'

/**
 * Abandoned checkout reminders (Studio → Marketing & tracking, off by default).
 *
 * Who gets one: a SIGNED-IN customer who
 *  - opened the checkout (`begin_checkout`, with their cart) more than
 *    `abandonedAfterHours` ago, and at most two days before that;
 *  - agreed to receive offers (`users.marketing_consent`, phase 4);
 *  - has not bought anything since;
 *  - still has something in that cart;
 *  - was never reminded about that cart (`checkout_reminders`, unique per cart).
 *
 * One notification through the existing notify path (email, and WhatsApp
 * when a template is approved and the customer opted in).
 */
const LOOKBACK_HOURS = 48

export async function sendCheckoutReminders(
  settings: MarketingSettings,
  now = new Date(),
): Promise<{ sent: number; skipped: string | null }> {
  if (!settings.abandonedEnabled) return { sent: 0, skipped: 'off' }
  const until = new Date(now.getTime() - settings.abandonedAfterHours * 3_600_000)
  const from = new Date(until.getTime() - LOOKBACK_HOURS * 3_600_000)

  const candidates = await db.execute<{
    user_id: string
    cart_id: string
    event_id: string
    name: string | null
  }>(sql`
    select distinct on (e.item_id) e.user_id, e.item_id as cart_id, e.event_id, u.name
    from analytics_events e
    join users u on u.id = e.user_id
    where e.name = 'begin_checkout'
      and e.item_kind = 'cart' and e.item_id is not null and e.user_id is not null
      and e.created_at >= ${from.toISOString()}::timestamptz
      and e.created_at < ${until.toISOString()}::timestamptz
      and u.marketing_consent = true and u.deleted_at is null
      and exists (select 1 from cart_items ci where ci.cart_id = e.item_id)
      and not exists (
        select 1 from analytics_events p
        where p.name = 'purchase' and p.user_id = e.user_id and p.created_at > e.created_at)
      and not exists (select 1 from checkout_reminders r where r.cart_id = e.item_id)
    order by e.item_id, e.created_at desc
    limit 100
  `)

  let sent = 0
  const { notifyUser } = await import('@/lib/notify')
  for (const row of candidates) {
    // Claim first: the unique index makes a second run (or a second worker) a no-op.
    const claimed = await db
      .insert(checkoutReminders)
      .values({ cartId: row.cart_id, userId: row.user_id, eventId: row.event_id })
      .onConflictDoNothing({ target: checkoutReminders.cartId })
      .returning({ id: checkoutReminders.id })
    if (claimed.length === 0) continue
    const id = await notifyUser(
      row.user_id,
      'checkout_reminder',
      { name: (row.name ?? '').trim().split(/\s+/)[0] || '—' },
      '/my-trip',
    )
    if (id !== null) sent += 1
  }
  return { sent, skipped: null }
}
