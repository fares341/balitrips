'use client'

/**
 * The site's tracker — mounted once in the locale layout.
 *
 * Does nothing at all until the visitor accepts the matching cookies
 * (`bt_consent`, see ./consent-banner):
 *
 *  - statistics: a random visitor id (`bt_aid`, 13 months) and session id
 *    (`bt_sid`, 30 minutes), the landing campaign (UTM, first and last
 *    touch), page views and the events in the catalogue — sent in small
 *    batches to our own `/api/analytics/collect`; and Google Analytics 4 if
 *    the owner switched it on;
 *  - marketing: Google Tag Manager, Meta Pixel and TikTok Pixel if switched
 *    on, each given the same event id as our own row so the platforms can
 *    drop duplicates with their server APIs.
 *
 * The landing campaign is held in memory only until a choice is made.
 * Nothing about the visitor's location is ever read or sent.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { eventsForClick, eventsForPath, TRACK_EVENT } from '@/lib/analytics/client'
import { allowsAnalytics, allowsMarketing, parseConsent, readCookie } from '@/lib/analytics/consent'
import type { BrowserEvent } from '@/lib/analytics/events'
import { plannedTags } from '@/lib/analytics/pixels'
import type { PublicTrackingConfig } from '@/lib/analytics/settings'
import {
  ANON_COOKIE,
  ANON_MAX_AGE_SECONDS,
  encodeTouch,
  FIRST_TOUCH_COOKIE,
  LAST_TOUCH_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  touchFromLanding,
  type Touch,
} from '@/lib/analytics/utm'

import { consentSnapshot, setCookie, subscribeConsent } from './consent-store'
import { loadTags, sendToTags } from './tags'

/** The landing campaign of this page load, kept in memory until consent. */
let landingTouch: Touch | null | undefined
let landingPending = true

function randomId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0'))
    .join('')
    .slice(0, 26)
}

function eventId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const b = new Uint8Array(16)
  crypto.getRandomValues(b)
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Visitor and session ids, campaign cookies. Analytics consent only. */
function ensureIdentity(): boolean {
  let fresh = false
  if (!readCookie(document.cookie, ANON_COOKIE)) {
    setCookie(ANON_COOKIE, randomId(), ANON_MAX_AGE_SECONDS)
    fresh = true
  }
  const session = readCookie(document.cookie, SESSION_COOKIE)
  if (!session) fresh = true
  setCookie(SESSION_COOKIE, session ?? randomId(), SESSION_MAX_AGE_SECONDS)
  if (landingTouch) {
    if (!readCookie(document.cookie, FIRST_TOUCH_COOKIE)) {
      setCookie(FIRST_TOUCH_COOKIE, encodeTouch(landingTouch), ANON_MAX_AGE_SECONDS)
    }
    setCookie(LAST_TOUCH_COOKIE, encodeTouch(landingTouch), ANON_MAX_AGE_SECONDS)
  }
  return fresh
}

interface Queued {
  event: BrowserEvent
  eventId: string
}

export function Tracking() {
  const pathname = usePathname()
  const raw = useSyncExternalStore<string | null | undefined>(
    subscribeConsent,
    consentSnapshot,
    () => undefined,
  )
  const consent = raw === undefined ? null : parseConsent(raw)
  const analytics = allowsAnalytics(consent)
  const marketing = allowsMarketing(consent)

  const queue = useRef<Queued[]>([])
  const landing = useRef(false)
  const timer = useRef<number | null>(null)
  const config = useRef<PublicTrackingConfig | null>(null)
  const live = useRef({ analytics: false, marketing: false })

  // Remember the landing campaign once per page load (memory only).
  useEffect(() => {
    if (landingTouch === undefined) {
      landingTouch = touchFromLanding(
        window.location.search,
        document.referrer,
        window.location.host,
      )
    }
  }, [])

  // Keep the consent the event handlers see current.
  useEffect(() => {
    live.current = { analytics, marketing }
  }, [analytics, marketing])

  // Third-party tags: fetched and loaded only after consent.
  useEffect(() => {
    if (!analytics && !marketing) return
    let cancelled = false
    const apply = (value: PublicTrackingConfig) => {
      if (cancelled) return
      config.current = value
      loadTags(plannedTags(consent, value))
    }
    if (config.current) apply(config.current)
    else {
      fetch('/api/analytics/config', { credentials: 'omit' })
        .then((response) =>
          response.ok ? (response.json() as Promise<PublicTrackingConfig>) : null,
        )
        .then((value) => {
          if (value) apply(value)
        })
        .catch(() => undefined)
    }
    return () => {
      cancelled = true
    }
    // `consent` is derived from the two flags.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics, marketing])

  // The sender: batch, beacon, never block navigation.
  useEffect(() => {
    const flush = () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current)
        timer.current = null
      }
      const batch = queue.current.splice(0, 20)
      if (batch.length === 0 || !live.current.analytics) return
      const body = JSON.stringify({
        landing: landing.current,
        events: batch.map(({ event, eventId: id }) => ({ ...event, eventId: id })),
      })
      landing.current = false
      try {
        if ('sendBeacon' in navigator) {
          navigator.sendBeacon(
            '/api/analytics/collect',
            new Blob([body], { type: 'application/json' }),
          )
        } else {
          void fetch('/api/analytics/collect', {
            method: 'POST',
            body,
            headers: { 'Content-Type': 'application/json' },
            keepalive: true,
          })
        }
      } catch {
        // never breaks the page
      }
      if (queue.current.length > 0) flush()
    }

    const emit = (event: BrowserEvent) => {
      const { analytics: a, marketing: m } = live.current
      if (!a && !m) return
      const id = event.eventId ?? eventId()
      if (a || m) sendToTags(event, id)
      // Purchases are stored by the server; the browser only tells the tags.
      if (a && event.name !== 'purchase') {
        queue.current.push({
          event: { ...event, path: event.path ?? window.location.pathname },
          eventId: id,
        })
        if (timer.current === null) timer.current = window.setTimeout(flush, 1000)
      }
    }

    const onTrack = (e: Event) => {
      const detail = (e as CustomEvent<BrowserEvent>).detail
      if (detail && typeof detail.name === 'string') emit(detail)
    }
    const onClick = (e: MouseEvent) => {
      const target = e.target instanceof Element ? e.target : null
      const tagged = target?.closest<HTMLElement>('[data-track]')
      if (tagged?.dataset.track) {
        emit({
          name: tagged.dataset.track as BrowserEvent['name'],
          itemKind: tagged.dataset.trackKind as BrowserEvent['itemKind'],
          itemRef: tagged.dataset.trackRef,
        })
      }
      const link = target?.closest<HTMLAnchorElement>('a[href]')
      if (!link) return
      for (const event of eventsForClick(
        link.href,
        window.location.pathname,
        window.location.origin,
      )) {
        emit(event)
      }
    }
    const onCart = () => {
      // Stored by the server action; the ad tags hear about it here.
      if (live.current.marketing) sendToTags({ name: 'add_to_cart' }, eventId())
    }
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }

    window.addEventListener(TRACK_EVENT, onTrack)
    document.addEventListener('click', onClick, { capture: true })
    window.addEventListener(CART_CHANGED_EVENT, onCart)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener(TRACK_EVENT, onTrack)
      document.removeEventListener('click', onClick, { capture: true })
      window.removeEventListener(CART_CHANGED_EVENT, onCart)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [])

  // Page views (and what the URL itself says: item pages, map, checkout).
  useEffect(() => {
    if (!pathname || (!analytics && !marketing)) return
    if (analytics) {
      const fresh = ensureIdentity()
      if (fresh || (landingPending && landingTouch)) landing.current = true
      landingPending = false
    }
    const search = window.location.search
    window.dispatchEvent(
      new CustomEvent<BrowserEvent>(TRACK_EVENT, { detail: { name: 'page_view', path: pathname } }),
    )
    for (const event of eventsForPath(pathname, search)) {
      window.dispatchEvent(
        new CustomEvent<BrowserEvent>(TRACK_EVENT, { detail: { ...event, path: pathname } }),
      )
    }
  }, [pathname, analytics, marketing])

  return null
}
