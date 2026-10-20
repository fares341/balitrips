import { eq } from 'drizzle-orm'
import { cookies, headers } from 'next/headers'

import { db } from '@/db'
import { orders, visitorAttribution } from '@/db/schema'

import { consentCode } from './consent'
import { visitorContext } from './record'

/**
 * Stamp a just-placed order with where it came from: the visitor's last and
 * first campaign (UTM), their visitor id, and what they allowed (analytics /
 * marketing). Called right after `checkout()` creates the order.
 *
 * Without analytics consent only the consent code ('' or 'm') is written —
 * no visitor id, no campaign. Never throws: attribution must not fail a sale.
 */
export async function attachOrderAttribution(orderId: string): Promise<void> {
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    const context = visitorContext(
      cookieStore
        .getAll()
        .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
        .join('; '),
      headerStore.get('user-agent'),
    )
    let first = context.firstTouch
    let last = context.lastTouch
    if (context.anonId !== null && (first === null || last === null)) {
      // The cookie may be gone while the row remains (another tab, cleared cookie).
      const [stored] = await db
        .select()
        .from(visitorAttribution)
        .where(eq(visitorAttribution.anonId, context.anonId))
        .limit(1)
      if (stored) {
        first ??= stored.firstSource
          ? {
              source: stored.firstSource,
              medium: stored.firstMedium,
              campaign: stored.firstCampaign,
            }
          : null
        last ??= stored.lastSource
          ? { source: stored.lastSource, medium: stored.lastMedium, campaign: stored.lastCampaign }
          : null
      }
    }
    last ??= first
    await db
      .update(orders)
      .set({
        utmSource: last?.source ?? null,
        utmMedium: last?.medium ?? null,
        utmCampaign: last?.campaign ?? null,
        utmFirst: first
          ? { source: first.source, medium: first.medium, campaign: first.campaign }
          : null,
        analyticsAnonId: context.anonId,
        trackingConsent: consentCode(context.consent),
      })
      .where(eq(orders.id, orderId))
  } catch (error) {
    console.error('[analytics] could not attach attribution to the order', { orderId, error })
  }
}
