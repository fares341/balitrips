/**
 * «أبلغني عند التوفر» — alerts for an `unavailable` activity.
 *
 *   subscribe  : public form (rate-limited, deduped per activity + contact)
 *   queue      : Studio puts the activity back to `published` → every waiting
 *                row is claimed in ONE update (`notified_at`), one job each
 *   send       : worker (`email.send`, kind `availability_alert`) mails and/or
 *                sends WhatsApp in the subscriber's language, stamps `sent_at`
 *
 * The contact is used for this alert only — never for marketing.
 */

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, availabilityAlerts } from '@/db/schema'
import { isLocale, type Locale } from '@/i18n/config'

import type { AlertContact } from './availability-contact'

export * from './availability-contact'

/**
 * Save (or re-arm) a request. Same activity + same contact = the same row; a
 * row already alerted is set waiting again. Returns false when the activity
 * is not `unavailable` (nothing to wait for).
 */
export async function subscribeAvailabilityAlert(input: {
  activityId: string
  contact: AlertContact
  locale: Locale
  userId: string | null
}): Promise<boolean> {
  const [activity] = await db
    .select({ status: activities.status })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), isNull(activities.deletedAt)))
    .limit(1)
  if (!activity || activity.status !== 'unavailable') return false
  await db
    .insert(availabilityAlerts)
    .values({
      activityId: input.activityId,
      userId: input.userId,
      email: input.contact.email,
      phone: input.contact.phone,
      contactKey: input.contact.key,
      locale: input.locale,
    })
    .onConflictDoUpdate({
      target: [availabilityAlerts.activityId, availabilityAlerts.contactKey],
      set: {
        locale: input.locale,
        userId: sql`coalesce(excluded.user_id, ${availabilityAlerts.userId})`,
        notifiedAt: null,
        sentAt: null,
      },
    })
  return true
}

/**
 * The activity is bookable again: claim every waiting row once and queue its
 * job. Never throws (a Studio save must not fail on this). Returns the count.
 */
export async function queueAvailabilityAlerts(activityId: string): Promise<number> {
  try {
    const claimed = await db
      .update(availabilityAlerts)
      .set({ notifiedAt: new Date() })
      .where(
        and(eq(availabilityAlerts.activityId, activityId), isNull(availabilityAlerts.notifiedAt)),
      )
      .returning({ id: availabilityAlerts.id })
    if (claimed.length === 0) return 0
    const { enqueueEmail } = await import('@/worker/queues')
    for (const row of claimed) {
      try {
        await enqueueEmail({ kind: 'availability_alert', alertId: row.id })
      } catch (error) {
        // Release the claim so the next publish tries again.
        console.error('[availability] enqueue failed', { alertId: row.id, error })
        await db
          .update(availabilityAlerts)
          .set({ notifiedAt: null })
          .where(eq(availabilityAlerts.id, row.id))
      }
    }
    return claimed.length
  } catch (error) {
    console.error('[availability] queue failed', { activityId, error })
    return 0
  }
}

/** Studio: waiting count for one activity. */
export async function countWaitingAlerts(activityId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(availabilityAlerts)
    .where(
      and(eq(availabilityAlerts.activityId, activityId), isNull(availabilityAlerts.notifiedAt)),
    )
  return Number(row?.n ?? 0)
}

/** Studio: the latest requests for one activity (waiting first). */
export async function listAlerts(activityId: string, limit = 200) {
  return db
    .select({
      id: availabilityAlerts.id,
      email: availabilityAlerts.email,
      phone: availabilityAlerts.phone,
      locale: availabilityAlerts.locale,
      createdAt: availabilityAlerts.createdAt,
      notifiedAt: availabilityAlerts.notifiedAt,
      sentAt: availabilityAlerts.sentAt,
    })
    .from(availabilityAlerts)
    .where(eq(availabilityAlerts.activityId, activityId))
    .orderBy(sql`${availabilityAlerts.notifiedAt} is not null`, desc(availabilityAlerts.createdAt))
    .limit(limit)
}

/** Worker: send one alert (email and/or WhatsApp), then stamp `sent_at`. */
export async function sendAvailabilityAlert(alertId: string): Promise<void> {
  const [row] = await db
    .select({
      alert: availabilityAlerts,
      name: activities.name,
      slug: activities.slug,
      status: activities.status,
    })
    .from(availabilityAlerts)
    .innerJoin(activities, eq(activities.id, availabilityAlerts.activityId))
    .where(eq(availabilityAlerts.id, alertId))
    .limit(1)
  if (!row || row.alert.sentAt !== null) return
  // Unavailable again before the job ran: leave it waiting for the next publish.
  if (row.status !== 'published') {
    await db
      .update(availabilityAlerts)
      .set({ notifiedAt: null })
      .where(eq(availabilityAlerts.id, alertId))
    return
  }
  const locale: Locale = isLocale(row.alert.locale) ? row.alert.locale : 'ar'
  const { pick } = await import('@/lib/content/localize')
  const { absoluteUrl } = await import('@/app/[locale]/_meta')
  const name = pick(row.name, locale)
  const href = `/activities/${row.slug}`
  const params = { name, link: absoluteUrl(href, locale) }

  // WhatsApp first: it is the call that throws for a retry, so a retry
  // never mails twice.
  if (row.alert.phone) {
    const { sendWhatsappTemplate } = await import('./whatsapp')
    // 5xx/429 throw → pg-boss retries the job (sent_at still null).
    const result = await sendWhatsappTemplate(row.alert.phone, 'activity_available', params, locale)
    if (!result.sent)
      console.info('[availability] WhatsApp not sent', { alertId, reason: result.reason })
  }
  if (row.alert.email) {
    const { emailGuest } = await import('./guest')
    await emailGuest({ to: row.alert.email, locale, type: 'activity_available', params, href })
  }
  await db
    .update(availabilityAlerts)
    .set({ sentAt: new Date() })
    .where(eq(availabilityAlerts.id, alertId))
}
