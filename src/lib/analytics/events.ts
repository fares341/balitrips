/**
 * The event catalogue — every event the platform tracks, and nothing else.
 *
 * Pure and dependency-free: imported by the browser tracker, the collect
 * endpoint, the worker and the Studio reports alike, so all four agree on
 * the names by construction.
 *
 * Two kinds of events:
 *
 *  - **browser** events describe what a visitor looked at or clicked. They
 *    are recorded only when the visitor accepted analytics cookies.
 *  - **server** events describe money and bookings (purchase, payment,
 *    booking, refund, VIP access…). They are written by the server from the
 *    payment path and from the database itself, with a deterministic event id
 *    (`serverEventId`), so a browser that reports the same purchase can never
 *    count it a second time. The browser may only send `purchase` with the id
 *    the server gave it — see `BROWSER_MIRRORED`.
 */

export const EVENT_NAMES = [
  'page_view',
  'view_item',
  'select_item',
  'view_map',
  'view_free_map',
  'view_vip_map',
  'vip_upgrade_click',
  'vip_purchase',
  'vip_access_granted',
  'map_place_view',
  'map_place_click',
  'map_to_activity_click',
  'itinerary_view',
  'itinerary_day_view',
  'itinerary_download',
  'itinerary_map_click',
  'package_view',
  'addon_selected',
  'add_to_cart',
  'begin_checkout',
  'payment_success',
  'payment_failed',
  'purchase',
  'booking_request',
  'booking_confirmed',
  'booking_cancelled',
  'refund',
  'lead_submit',
  'whatsapp_click',
  'support_ticket_created',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && (EVENT_NAMES as readonly string[]).includes(value)
}

/** Written only by the server (payment path, worker sync). */
export const SERVER_EVENTS: ReadonlySet<EventName> = new Set<EventName>([
  'vip_purchase',
  'vip_access_granted',
  'itinerary_download',
  'payment_success',
  'payment_failed',
  'purchase',
  'booking_request',
  'booking_confirmed',
  'booking_cancelled',
  'refund',
  'lead_submit',
  'support_ticket_created',
])

/**
 * Server events the browser also reports to ad pixels — with the SAME event
 * id the server stored. The collect endpoint accepts them only with a
 * well-formed id, and the unique index makes the second copy a no-op.
 */
export const BROWSER_MIRRORED: ReadonlySet<EventName> = new Set<EventName>(['purchase'])

/** What the browser may post to `/api/analytics/collect`. */
export function browserMaySend(name: EventName): boolean {
  return !SERVER_EVENTS.has(name) || BROWSER_MIRRORED.has(name)
}

/** Item kinds an event may point at. */
export const ITEM_KINDS = [
  'activity',
  'itinerary',
  'package',
  'plan',
  'place',
  'addon',
  'order_item',
  'custom',
  'driver',
  /** begin_checkout: the cart (set by the server, never trusted from a browser). */
  'cart',
] as const
export type ItemKind = (typeof ITEM_KINDS)[number]

export function isItemKind(value: unknown): value is ItemKind {
  return typeof value === 'string' && (ITEM_KINDS as readonly string[]).includes(value)
}

/** Payload a browser sends. Every field is optional except the name. */
export interface BrowserEvent {
  name: EventName
  eventId?: string
  path?: string
  itemKind?: ItemKind
  itemRef?: string
  itemId?: string
  valueMinor?: number
  currency?: string
  props?: Record<string, string | number | boolean | null>
}

/**
 * The prop keys allowed through. Anything else is dropped at the door — this
 * is where "never record precise location" and "never record personal data"
 * are enforced, rather than trusting every caller.
 */
export const ALLOWED_PROPS = [
  'filter',
  'category',
  'region',
  'day',
  'access',
  'plan',
  'source',
  'list',
  'position',
  'target',
  'qty',
] as const

const PROP_KEYS: ReadonlySet<string> = new Set(ALLOWED_PROPS)

/** Keep allowed keys, short scalar values only. */
export function cleanProps(
  props: unknown,
): Record<string, string | number | boolean | null> | null {
  if (props === null || typeof props !== 'object' || Array.isArray(props)) return null
  const out: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
    if (!PROP_KEYS.has(key)) continue
    if (typeof value === 'string') out[key] = value.slice(0, 80)
    else if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean' || value === null) out[key] = value
  }
  return Object.keys(out).length === 0 ? null : out
}

/** Path only, never a query string or fragment (they can carry personal data). */
export function cleanPath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null
  return (path.split(/[?#]/)[0] ?? '').slice(0, 300)
}
