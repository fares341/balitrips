/**
 * Abandoned-cart reminder (Studio → Leads → settings, off by default).
 *
 * A cart with items, untouched for the configured delay (default 1 hour),
 * with no order placed since, whose owner is reachable WITH consent:
 *  - a lead (popup / checkout) tied to the cart's cookie or account, with
 *    WhatsApp and/or e-mail consent; or
 *  - a signed-in customer who agreed to offers (`users.marketing_consent`).
 *
 * At most ONE reminder per cart, ever: the `cart_reminders` primary key is
 * claimed with INSERT … ON CONFLICT DO NOTHING before anything is sent, so
 * two workers on the same tick cannot both send. Paying (or just placing an
 * order) stops it, because an order since the last cart change excludes it.
 * Carts older than three days are left alone so turning it on does not
 * message old carts.
 */

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { cartReminders } from '@/db/schema'
import { messageLocale } from '@/lib/whatsapp/automations'

import { upsertLead } from './capture'
import { reminderChannel } from './rules'
import { readLeadSettings, type LeadSettings } from './settings'

export interface AbandonedCandidate {
  cart_id: string
  user_id: string | null
  lead_id: string | null
  name: string | null
  phone: string | null
  email: string | null
  locale: string | null
  wa_consent: boolean
  email_consent: boolean
}

export async function findAbandonedCarts(delayMinutes: number): Promise<AbandonedCandidate[]> {
  const result = await db.execute(sql`
    with active as (
      select c.id, c.user_id, c.anonymous_token, c.created_at,
        greatest(c.updated_at, (select max(ci.updated_at) from cart_items ci where ci.cart_id = c.id)) as last_at
      from carts c
      where exists (select 1 from cart_items ci where ci.cart_id = c.id)
        and not exists (select 1 from cart_reminders r where r.cart_id = c.id)
    )
    select a.id as cart_id, a.user_id, l.id as lead_id,
      coalesce(l.name, u.name) as name,
      coalesce(l.phone, u.phone) as phone,
      coalesce(l.email, case when u.email like '%.invalid' then null else lower(u.email) end) as email,
      coalesce(l.locale, u.locale) as locale,
      (coalesce(l.whatsapp_consent, false) or coalesce(u.marketing_consent, false)) as wa_consent,
      (coalesce(l.email_consent, false) or coalesce(u.marketing_consent, false)) as email_consent
    from active a
    left join users u on u.id = a.user_id and u.deleted_at is null
    left join lateral (
      select * from lead_contacts lc
      where (a.anonymous_token is not null and lc.cart_token = a.anonymous_token)
         or (a.user_id is not null and lc.user_id = a.user_id)
         or (u.email is not null and lc.email = lower(u.email))
      order by lc.updated_at desc limit 1
    ) l on true
    where a.last_at <= now() - make_interval(mins => ${delayMinutes})
      and a.last_at > now() - interval '3 days'
      and (l.id is not null or u.id is not null)
      and not exists (
        select 1 from orders o where o.created_at >= a.last_at - interval '5 minutes'
          and ((a.user_id is not null and o.user_id = a.user_id)
            or (l.email is not null and lower(o.customer_snapshot->>'email') = l.email)
            or (l.phone is not null and o.customer_snapshot->>'phone' = l.phone))
      )
    limit 200`)
  return result as unknown as AbandonedCandidate[]
}

export interface SweepDeps {
  sendWhatsapp: (c: AbandonedCandidate, leadId: string | null) => Promise<void>
  sendEmail: (c: AbandonedCandidate) => Promise<void>
}

const defaultDeps: SweepDeps = {
  async sendWhatsapp(c) {
    const { triggerContactAutomation } = await import('@/lib/whatsapp/dispatch')
    const { absoluteUrl } = await import('@/app/[locale]/_meta')
    const locale = messageLocale(c.locale)
    await triggerContactAutomation(
      'cart_reminder',
      `cart_reminder:${c.cart_id}`,
      { userId: c.user_id, phone: c.phone, consent: true, locale, name: c.name ?? '' },
      { name: c.name?.trim() || '-', link: absoluteUrl('/cart', locale) },
    )
  },
  async sendEmail(c) {
    const { emailGuest } = await import('@/lib/notify/guest')
    await emailGuest({
      to: c.email,
      locale: messageLocale(c.locale),
      type: 'cart_reminder',
      params: {},
      name: c.name,
      href: '/cart',
    })
  },
}

/** One pass. Returns how many carts got their reminder. */
export async function runAbandonedCartSweep(
  options: { settings?: LeadSettings; deps?: SweepDeps } = {},
): Promise<number> {
  const settings = options.settings ?? (await readLeadSettings())
  if (!settings.abandonedEnabled) return 0
  const deps = options.deps ?? defaultDeps
  const due = await findAbandonedCarts(settings.abandonedDelayMinutes)
  let sent = 0
  for (const c of due) {
    const channel = reminderChannel({
      phone: c.phone,
      email: c.email,
      whatsappConsent: c.wa_consent,
      emailConsent: c.email_consent,
    })
    if (channel === 'none') continue
    let leadId = c.lead_id
    if (leadId === null) {
      // A consenting account without a lead row yet: record where we met them.
      const lead = await upsertLead({
        source: 'abandoned',
        name: c.name,
        phone: c.phone,
        email: c.email,
        locale: messageLocale(c.locale),
        userId: c.user_id,
      }).catch(() => null)
      leadId = lead?.id ?? null
    }
    const claimed = await db
      .insert(cartReminders)
      .values({ cartId: c.cart_id, leadId, userId: c.user_id, channel })
      .onConflictDoNothing()
      .returning({ cartId: cartReminders.cartId })
    if (claimed.length === 0) continue
    try {
      if (channel === 'whatsapp' || channel === 'both') await deps.sendWhatsapp(c, leadId)
      if (channel === 'email' || channel === 'both') await deps.sendEmail(c)
      sent += 1
    } catch (error) {
      console.error('[leads] cart reminder failed', { cartId: c.cart_id, error })
    }
  }
  return sent
}
