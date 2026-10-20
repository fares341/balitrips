/**
 * Browser API for the tracking layer.
 *
 *   import { track } from '@/lib/analytics/client'
 *   track('map_place_view', { itemKind: 'place', itemRef: slug })
 *
 * `track` only announces the event on `window`; the tracker mounted in the
 * site layout (`src/components/analytics/tracking.tsx`) decides — from the
 * visitor's consent — whether it is stored and whether it goes to any
 * third-party tag. Calling it with no consent, or before the tracker has
 * mounted, does nothing. It never throws.
 */

import type { BrowserEvent, EventName } from './events'

export const TRACK_EVENT = 'bt:track'

export type TrackData = Omit<BrowserEvent, 'name'>

export function track(name: EventName, data: TrackData = {}): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent<BrowserEvent>(TRACK_EVENT, { detail: { name, ...data } }))
  } catch {
    // Tracking never breaks the page.
  }
}

/** A map error report (no visitor id, no message text). */
export function reportMapError(code: string): void {
  if (typeof window === 'undefined') return
  try {
    const body = JSON.stringify({ area: 'map', code, path: window.location.pathname })
    if ('sendBeacon' in navigator) {
      navigator.sendBeacon('/api/analytics/error', new Blob([body], { type: 'application/json' }))
      return
    }
    void fetch('/api/analytics/error', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    })
  } catch {
    // ignore
  }
}

/**
 * Item pages recognised from the URL alone, so most views need no code in
 * the page: `/ar/activities/<slug>` → view_item (activity), and so on.
 * Returns the events a page view implies besides `page_view` itself.
 */
export function eventsForPath(pathname: string, search: string): BrowserEvent[] {
  const parts = pathname.split('/').filter(Boolean)
  // Drop the locale prefix when present.
  if (parts[0] && /^(ar|en|id)$/.test(parts[0])) parts.shift()
  const [section, slug] = parts
  const events: BrowserEvent[] = []
  const params = new URLSearchParams(search)
  if (section === 'activities' && slug) {
    events.push({ name: 'view_item', itemKind: 'activity', itemRef: slug })
  } else if (section === 'itineraries' && slug) {
    events.push({ name: 'view_item', itemKind: 'itinerary', itemRef: slug })
    events.push({ name: 'itinerary_view', itemKind: 'itinerary', itemRef: slug })
  } else if (section === 'packages' && slug) {
    events.push({ name: 'view_item', itemKind: 'package', itemRef: slug })
    events.push({ name: 'package_view', itemKind: 'package', itemRef: slug })
  } else if (section === 'places' && slug) {
    events.push({ name: 'view_item', itemKind: 'place', itemRef: slug })
  } else if (section === 'map' && !slug) {
    events.push({ name: 'view_map' })
    const place = params.get('place')
    if (place)
      events.push({ name: 'map_place_view', itemKind: 'place', itemRef: place.slice(0, 128) })
    const itinerary = params.get('itinerary')
    const day = Number(params.get('day'))
    if (itinerary && Number.isInteger(day) && day >= 1) {
      events.push({
        name: 'itinerary_day_view',
        itemKind: 'itinerary',
        itemRef: itinerary.slice(0, 128),
        props: { day },
      })
    }
    const category = params.get('cat')
    if (category) events.push({ name: 'select_item', props: { filter: 'category', category } })
    const region = params.get('region')
    if (region) events.push({ name: 'select_item', props: { filter: 'region', region } })
  } else if (section === 'checkout' && !slug) {
    events.push({ name: 'begin_checkout' })
  }
  return events
}

/** What a click on a link means, judged from where it points and where we are. */
export function eventsForClick(href: string, currentPath: string, origin: string): BrowserEvent[] {
  let url: URL
  try {
    url = new URL(href, origin)
  } catch {
    return []
  }
  const host = url.hostname.toLowerCase()
  if (
    host === 'wa.me' ||
    host === 'api.whatsapp.com' ||
    host === 'web.whatsapp.com' ||
    url.protocol === 'whatsapp:'
  ) {
    return [{ name: 'whatsapp_click', path: currentPath }]
  }
  if (url.origin !== origin) return []

  const strip = (path: string) => {
    const parts = path.split('/').filter(Boolean)
    if (parts[0] && /^(ar|en|id)$/.test(parts[0])) parts.shift()
    return parts
  }
  const from = strip(currentPath)
  const to = strip(url.pathname)
  const events: BrowserEvent[] = []
  const kinds: Record<string, BrowserEvent['itemKind']> = {
    activities: 'activity',
    itineraries: 'itinerary',
    packages: 'package',
    places: 'place',
  }
  const targetKind = to[0] ? kinds[to[0]] : undefined
  const onMap = from[0] === 'map'

  if (onMap && to[0] === 'activities' && to[1]) {
    events.push({ name: 'map_to_activity_click', itemKind: 'activity', itemRef: to[1] })
  }
  if (from[0] === 'itineraries' && from[1] && to[0] === 'map') {
    events.push({ name: 'itinerary_map_click', itemKind: 'itinerary', itemRef: from[1] })
  }
  if (to[0] === 'plans') {
    events.push({ name: 'vip_upgrade_click', props: { source: from[0] ?? 'home' } })
  }
  // A product picked from a list (listing, home, search, map).
  if (targetKind && to[1] && !(from[0] === to[0] && from[1] === to[1])) {
    events.push({
      name: 'select_item',
      itemKind: targetKind,
      itemRef: to[1],
      props: { list: from[0] ?? 'home' },
    })
  }
  return events
}
