/**
 * Third-party tag loader (browser only). Called by the tracker with the
 * result of `plannedTags()` — which is empty without consent — so this file
 * never decides by itself to load anything.
 */

import type { BrowserEvent } from '@/lib/analytics/events'
import {
  ga4EventName,
  metaEventName,
  tiktokEventName,
  toMajor,
  type PlannedTag,
  type TagTool,
} from '@/lib/analytics/pixels'

type Fn = (...args: unknown[]) => void

interface TagWindow {
  dataLayer?: unknown[]
  gtag?: Fn
  fbq?: Fn & { callMethod?: Fn; queue?: unknown[]; push?: Fn; loaded?: boolean; version?: string }
  _fbq?: unknown
  ttq?: unknown[] & Record<string, unknown>
  TiktokAnalyticsObject?: string
}

const loaded = new Set<TagTool>()

function inject(src: string): void {
  const script = document.createElement('script')
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

export function loadTags(tags: readonly PlannedTag[]): void {
  const w = window as unknown as TagWindow
  for (const tag of tags) {
    if (loaded.has(tag.tool)) continue
    loaded.add(tag.tool)
    switch (tag.tool) {
      case 'ga4': {
        const dataLayer = w.dataLayer ?? []
        w.dataLayer = dataLayer
        w.gtag = function gtag() {
          // gtag needs the `arguments` object itself, not an array.
          // eslint-disable-next-line prefer-rest-params
          dataLayer.push(arguments)
        }
        w.gtag('js', new Date())
        // Page views are sent by the tracker on every route change.
        w.gtag('config', tag.id, { send_page_view: false })
        inject(tag.src)
        break
      }
      case 'gtm': {
        w.dataLayer = w.dataLayer ?? []
        w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' })
        inject(tag.src)
        break
      }
      case 'meta': {
        if (!w.fbq) {
          type FbqStub = Fn & {
            callMethod?: Fn
            queue: unknown[]
            push?: Fn
            loaded?: boolean
            version?: string
          }
          const stub = ((...args: unknown[]) => {
            if (stub.callMethod) stub.callMethod(...args)
            else stub.queue.push(args)
          }) as FbqStub
          stub.queue = []
          stub.push = stub
          stub.loaded = true
          stub.version = '2.0'
          w.fbq = stub
          if (!w._fbq) w._fbq = stub
        }
        inject(tag.src)
        w.fbq('init', tag.id)
        break
      }
      case 'tiktok': {
        w.TiktokAnalyticsObject = 'ttq'
        const ttq = (w.ttq ?? []) as unknown[] & Record<string, unknown>
        w.ttq = ttq
        const methods = [
          'page',
          'track',
          'identify',
          'instances',
          'debug',
          'on',
          'off',
          'once',
          'ready',
          'alias',
          'group',
          'enableCookie',
          'disableCookie',
        ]
        for (const method of methods) {
          ttq[method] = (...args: unknown[]) => {
            ttq.push([method, ...args])
          }
        }
        ttq._i = { ...((ttq._i as object | undefined) ?? {}), [tag.id]: [] }
        ttq._t = { ...((ttq._t as object | undefined) ?? {}), [tag.id]: Date.now() }
        ttq._o = { ...((ttq._o as object | undefined) ?? {}), [tag.id]: {} }
        inject(tag.src)
        break
      }
    }
  }
}

export function isLoaded(tool: TagTool): boolean {
  return loaded.has(tool)
}

/** Send one event to every loaded tag, with the same event id everywhere. */
export function sendToTags(event: BrowserEvent, eventId: string): void {
  const w = window as unknown as TagWindow
  const value =
    typeof event.valueMinor === 'number' && event.currency
      ? toMajor(event.valueMinor, event.currency)
      : undefined
  const item =
    event.itemRef && event.name !== 'purchase'
      ? { id: event.itemRef, kind: event.itemKind ?? 'item' }
      : null
  try {
    if (loaded.has('ga4') && w.gtag) {
      w.gtag('event', ga4EventName(event.name), {
        event_id: eventId,
        // GA4 de-duplicates purchases on the transaction id (the order number).
        ...(event.name === 'purchase' && event.itemRef ? { transaction_id: event.itemRef } : {}),
        ...(value !== undefined ? { value, currency: event.currency } : {}),
        ...(item ? { items: [{ item_id: item.id, item_category: item.kind }] } : {}),
      })
    }
    if (loaded.has('gtm') && w.dataLayer) {
      w.dataLayer.push({
        event: event.name,
        event_id: eventId,
        item_kind: event.itemKind ?? null,
        item_ref: event.itemRef ?? null,
        ...(value !== undefined ? { value, currency: event.currency } : {}),
      })
    }
    if (loaded.has('meta') && w.fbq) {
      const name = metaEventName(event.name)
      const params = {
        ...(item
          ? { content_ids: [item.id], content_type: 'product', content_category: item.kind }
          : {}),
        ...(value !== undefined ? { value, currency: event.currency } : {}),
      }
      if (name) w.fbq('track', name, params, { eventID: eventId })
      else w.fbq('trackCustom', event.name, params, { eventID: eventId })
    }
    if (loaded.has('tiktok') && w.ttq) {
      const name = tiktokEventName(event.name)
      const track = w.ttq.track as Fn | undefined
      const page = w.ttq.page as Fn | undefined
      if (event.name === 'page_view' && page) page()
      else if (name && track) {
        track(
          name,
          {
            ...(item ? { contents: [{ content_id: item.id, content_type: 'product' }] } : {}),
            ...(value !== undefined ? { value, currency: event.currency } : {}),
          },
          { event_id: eventId },
        )
      }
    }
  } catch {
    // A broken third-party tag never breaks the page.
  }
}
