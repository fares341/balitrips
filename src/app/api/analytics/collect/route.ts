/**
 * POST /api/analytics/collect — first-party events from the browser.
 *
 * Recorded only when the visitor accepted analytics cookies (`bt_consent`);
 * otherwise the request is answered 204 and nothing is stored. Only catalogue
 * names a browser may send are accepted (`browserMaySend`); money events
 * (purchase, payment, refund…) come from the server alone, so a browser can
 * neither invent nor double a sale. Paths lose their query string, props are
 * reduced to a short allow-list, and no location is ever accepted.
 *
 * Small in-memory rate limit per visitor: this runs on one host, and a
 * runaway tab must not fill the table.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { carts } from '@/db/schema'
import { getSession } from '@/lib/auth/session'
import { loadEntitlements } from '@/lib/entitlements'
import {
  browserMaySend,
  cleanPath,
  cleanProps,
  isEventName,
  isItemKind,
  type EventName,
} from '@/lib/analytics/events'
import { isUuid } from '@/lib/analytics/event-id'
import { resolveItemIds } from '@/lib/analytics/items'
import {
  recordEvents,
  rememberAttribution,
  visitorContext,
  marketingAllowed,
  type EventRow,
} from '@/lib/analytics/record'
import { allowsAnalytics } from '@/lib/analytics/consent'

export const dynamic = 'force-dynamic'

const MAX_BATCH = 20
const PER_MINUTE = 120
const buckets = new Map<string, { count: number; resetAt: number }>()

function allow(key: string, cost: number): boolean {
  const now = Date.now()
  if (buckets.size > 20_000) {
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k)
  }
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: cost, resetAt: now + 60_000 })
    return cost <= PER_MINUTE
  }
  bucket.count += cost
  return bucket.count <= PER_MINUTE
}

const nothing = () => new NextResponse(null, { status: 204 })

interface Incoming {
  name?: unknown
  eventId?: unknown
  path?: unknown
  itemKind?: unknown
  itemRef?: unknown
  valueMinor?: unknown
  currency?: unknown
  props?: unknown
}

export async function POST(request: Request): Promise<NextResponse> {
  const context = visitorContext(request.headers.get('cookie'), request.headers.get('user-agent'))
  if (!allowsAnalytics(context.consent) || context.anonId === null) return nothing()

  let body: { events?: unknown; landing?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return nothing()
  }
  const list = Array.isArray(body.events) ? (body.events as Incoming[]).slice(0, MAX_BATCH) : []
  if (list.length === 0 || !allow(context.anonId, list.length)) return nothing()

  const session = await getSession()
  const userId = session?.user.id ?? null
  const marketing = marketingAllowed(context)

  const valid = list.filter(
    (event): event is Incoming & { name: EventName } =>
      isEventName(event.name) && browserMaySend(event.name) && event.name !== 'purchase',
  )
  if (valid.length === 0) return nothing()

  const refs = valid
    .filter((e) => isItemKind(e.itemKind) && typeof e.itemRef === 'string')
    .map((e) => ({ kind: e.itemKind as string, ref: e.itemRef as string }))
  const ids = refs.length > 0 ? await resolveItemIds(refs) : new Map<string, string>()

  const rows: EventRow[] = []
  for (const event of valid) {
    const itemKind = isItemKind(event.itemKind) && event.itemKind !== 'cart' ? event.itemKind : null
    const itemRef = typeof event.itemRef === 'string' ? event.itemRef.slice(0, 160) : null
    const value =
      typeof event.valueMinor === 'number' &&
      Number.isSafeInteger(event.valueMinor) &&
      event.valueMinor >= 0
        ? event.valueMinor
        : null
    const currency =
      typeof event.currency === 'string' && /^[A-Z]{3}$/.test(event.currency)
        ? event.currency
        : null
    const row: EventRow = {
      eventId: isUuid(event.eventId) ? event.eventId : undefined,
      name: event.name,
      source: 'browser',
      userId,
      anonId: context.anonId,
      sessionId: context.sessionId,
      path: cleanPath(event.path),
      itemKind,
      itemRef,
      itemId: itemKind && itemRef ? (ids.get(`${itemKind}:${itemRef}`) ?? null) : null,
      valueMinor: value,
      currency: value === null ? null : currency,
      touch: context.lastTouch ?? context.firstTouch,
      deviceType: context.deviceType,
      props: cleanProps(event.props),
      consentMarketing: marketing,
    }

    if (event.name === 'begin_checkout' && userId !== null) {
      // The cart is attached here, from the session — the reminder job needs it.
      const [cart] = await db
        .select({ id: carts.id })
        .from(carts)
        .where(and(eq(carts.userId, userId), isNull(carts.anonymousToken)))
        .limit(1)
      if (cart) {
        row.itemKind = 'cart'
        row.itemId = cart.id
      }
    }
    rows.push(row)

    if (event.name === 'view_map') {
      // Free or VIP is decided here from the account, not by the browser.
      const held = await loadEntitlements(userId)
      rows.push({
        ...row,
        eventId: undefined,
        name: held.has('vip') ? 'view_vip_map' : 'view_free_map',
      })
    }
  }

  await recordEvents(rows)
  if (body.landing === true) {
    const first = rows.find((r) => r.name === 'page_view')
    await rememberAttribution(context, userId, first?.path ?? null)
  }
  return nothing()
}
