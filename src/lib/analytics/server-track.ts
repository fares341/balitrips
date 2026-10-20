import { cookies, headers } from 'next/headers'

import { getSession } from '@/lib/auth/session'

import type { EventName, ItemKind } from './events'
import { recordEvents, visitorContext, marketingAllowed, type EventRow } from './record'
import { allowsAnalytics } from './consent'

/**
 * Record a visitor event from a server action (add to cart, add-on picked) —
 * where the server, not the browser, knows exactly what was added.
 *
 * Same rule as the browser: nothing is stored unless the visitor accepted
 * analytics cookies. Never throws and never slows the action down by more
 * than one insert.
 */
export interface ServerTrackItem {
  name: EventName
  itemKind?: ItemKind | null
  itemId?: string | null
  valueMinor?: number | null
  currency?: string | null
  props?: Record<string, string | number | boolean | null> | null
}

export async function trackFromServer(items: readonly ServerTrackItem[]): Promise<void> {
  if (items.length === 0) return
  try {
    const [cookieStore, headerStore] = await Promise.all([cookies(), headers()])
    const context = visitorContext(
      cookieStore
        .getAll()
        .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
        .join('; '),
      headerStore.get('user-agent'),
    )
    if (!allowsAnalytics(context.consent) || context.anonId === null) return
    const session = await getSession()
    const rows: EventRow[] = items.map((item) => ({
      name: item.name,
      source: 'browser',
      userId: session?.user.id ?? null,
      anonId: context.anonId,
      sessionId: context.sessionId,
      itemKind: item.itemKind ?? null,
      itemId: item.itemId ?? null,
      valueMinor: item.valueMinor ?? null,
      currency: item.currency ?? null,
      touch: context.lastTouch ?? context.firstTouch,
      deviceType: context.deviceType,
      props: item.props ?? null,
      consentMarketing: marketingAllowed(context),
    }))
    await recordEvents(rows)
  } catch (error) {
    console.error('[analytics] server-side track failed', error)
  }
}

/** Cart line kind → the item kind reports group it under. */
export function itemKindForCart(kind: string): ItemKind | null {
  switch (kind) {
    case 'activity':
    case 'activity_tier':
      return 'activity'
    case 'itinerary':
    case 'package':
    case 'plan':
    case 'place':
    case 'custom':
    case 'driver':
      return kind
    default:
      return null
  }
}
