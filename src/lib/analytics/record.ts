import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { analyticsEvents, visitorAttribution } from '@/db/schema'
import { parseDeviceType } from '@/lib/security/fingerprint'

import {
  allowsAnalytics,
  allowsMarketing,
  CONSENT_COOKIE,
  parseConsent,
  readCookie,
  type Consent,
} from './consent'
import { isUuid } from './event-id'
import type { EventName, ItemKind } from './events'
import {
  ANON_COOKIE,
  decodeTouch,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  SESSION_COOKIE,
  type Touch,
} from './utm'

/**
 * Writing events. Never throws: a full table or a lock must not fail the page
 * or the payment it is describing.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

export interface EventRow {
  eventId?: string
  name: EventName
  source: 'browser' | 'server'
  userId?: string | null
  anonId?: string | null
  sessionId?: string | null
  path?: string | null
  itemKind?: ItemKind | string | null
  itemId?: string | null
  itemRef?: string | null
  orderId?: string | null
  valueMinor?: number | null
  currency?: string | null
  touch?: Touch | null
  deviceType?: string | null
  props?: Record<string, string | number | boolean | null> | null
  consentMarketing?: boolean
  createdAt?: Date
}

function toValues(row: EventRow) {
  return {
    eventId: row.eventId && isUuid(row.eventId) ? row.eventId : randomUUID(),
    name: row.name,
    source: row.source,
    userId: row.userId ?? null,
    anonId: row.anonId ?? null,
    sessionId: row.sessionId ?? null,
    path: row.path ?? null,
    itemKind: row.itemKind ?? null,
    itemId: row.itemId && isUuid(row.itemId) ? row.itemId : null,
    itemRef: row.itemRef ? row.itemRef.slice(0, 160) : null,
    orderId: row.orderId ?? null,
    valueMinor: row.valueMinor ?? null,
    currency: row.currency ?? null,
    utmSource: row.touch?.source ?? null,
    utmMedium: row.touch?.medium ?? null,
    utmCampaign: row.touch?.campaign ?? null,
    deviceType: row.deviceType ?? null,
    props: row.props ?? null,
    consentMarketing: row.consentMarketing ?? false,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
  }
}

/** Insert events; an event id already stored is skipped. Returns rows written. */
export async function recordEvents(rows: readonly EventRow[], tx?: Tx): Promise<number> {
  if (rows.length === 0) return 0
  const values = rows.map(toValues)
  try {
    if (tx) {
      // A savepoint: a failure here must not abort the payment transaction.
      return await tx.transaction(async (sp) => {
        const written = await sp
          .insert(analyticsEvents)
          .values(values)
          .onConflictDoNothing({ target: analyticsEvents.eventId })
          .returning({ id: analyticsEvents.id })
        return written.length
      })
    }
    const written = await db
      .insert(analyticsEvents)
      .values(values)
      .onConflictDoNothing({ target: analyticsEvents.eventId })
      .returning({ id: analyticsEvents.id })
    return written.length
  } catch (error) {
    console.error(
      '[analytics] could not record events',
      rows.map((r) => r.name),
      error,
    )
    return 0
  }
}

export async function recordEvent(row: EventRow, tx?: Tx): Promise<boolean> {
  return (await recordEvents([row], tx)) > 0
}

/** Who and where, from the request cookies and headers. */
export interface VisitorContext {
  consent: Consent | null
  anonId: string | null
  sessionId: string | null
  firstTouch: Touch | null
  lastTouch: Touch | null
  deviceType: string
}

const ID = /^[A-Za-z0-9_-]{16,64}$/

export function visitorContext(
  cookieHeader: string | null,
  userAgent: string | null,
): VisitorContext {
  const consent = parseConsent(readCookie(cookieHeader, CONSENT_COOKIE))
  const analytics = allowsAnalytics(consent)
  const anon = readCookie(cookieHeader, ANON_COOKIE)
  const session = readCookie(cookieHeader, SESSION_COOKIE)
  return {
    consent,
    // Without analytics consent the ids are ignored even if a cookie lingers.
    anonId: analytics && anon && ID.test(anon) ? anon : null,
    sessionId: analytics && session && ID.test(session) ? session : null,
    firstTouch: analytics ? decodeTouch(readCookie(cookieHeader, FIRST_TOUCH_COOKIE)) : null,
    lastTouch: analytics ? decodeTouch(readCookie(cookieHeader, LAST_TOUCH_COOKIE)) : null,
    deviceType: parseDeviceType(userAgent),
  }
}

export function marketingAllowed(context: VisitorContext): boolean {
  return allowsMarketing(context.consent)
}

/** Keep the visitor's first and last campaign on their id. */
export async function rememberAttribution(
  context: VisitorContext,
  userId: string | null,
  landingPath: string | null,
): Promise<void> {
  if (context.anonId === null) return
  const first = context.firstTouch
  const last = context.lastTouch
  try {
    await db
      .insert(visitorAttribution)
      .values({
        anonId: context.anonId,
        userId,
        firstSource: first?.source ?? null,
        firstMedium: first?.medium ?? null,
        firstCampaign: first?.campaign ?? null,
        firstLandingPath: landingPath,
        lastSource: last?.source ?? first?.source ?? null,
        lastMedium: last?.medium ?? first?.medium ?? null,
        lastCampaign: last?.campaign ?? first?.campaign ?? null,
      })
      .onConflictDoUpdate({
        target: visitorAttribution.anonId,
        set: {
          userId: sql`coalesce(${userId}::uuid, ${visitorAttribution.userId})`,
          // First touch is written once; only fill it if it was empty.
          firstSource: sql`coalesce(${visitorAttribution.firstSource}, ${first?.source ?? null})`,
          firstMedium: sql`coalesce(${visitorAttribution.firstMedium}, ${first?.medium ?? null})`,
          firstCampaign: sql`coalesce(${visitorAttribution.firstCampaign}, ${first?.campaign ?? null})`,
          lastSource: sql`coalesce(${last?.source ?? null}, ${visitorAttribution.lastSource})`,
          lastMedium: last ? (last.medium ?? null) : sql`${visitorAttribution.lastMedium}`,
          lastCampaign: last ? (last.campaign ?? null) : sql`${visitorAttribution.lastCampaign}`,
          lastSeenAt: new Date(),
        },
      })
  } catch (error) {
    console.error('[analytics] could not store attribution', error)
  }
}
