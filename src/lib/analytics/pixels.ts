/**
 * Third-party tags: which ones may load, and how an event is named for each.
 *
 * Pure and browser-safe. The loader (`src/components/analytics/tracking.tsx`)
 * asks `plannedTags()` what to load; without consent the answer is empty, so
 * no third-party script tag is ever written for a visitor who has not said
 * yes. GA4 counts as analytics; GTM, Meta and TikTok as marketing.
 *
 * Nothing personal ever goes to these tools from the browser: event name,
 * event id, item ids/kinds, value and currency only.
 */

import { minorUnitExponent } from '@/lib/money'

import { allowsAnalytics, allowsMarketing, type Consent } from './consent'
import type { EventName } from './events'
import type { PublicTrackingConfig } from './settings'

export type TagTool = 'ga4' | 'gtm' | 'meta' | 'tiktok'

export interface PlannedTag {
  tool: TagTool
  id: string
  src: string
}

export function plannedTags(
  consent: Consent | null,
  config: PublicTrackingConfig | null,
): PlannedTag[] {
  if (config === null) return []
  const tags: PlannedTag[] = []
  if (allowsAnalytics(consent) && config.ga4) {
    tags.push({
      tool: 'ga4',
      id: config.ga4,
      src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4)}`,
    })
  }
  if (allowsMarketing(consent)) {
    if (config.gtm) {
      tags.push({
        tool: 'gtm',
        id: config.gtm,
        src: `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(config.gtm)}`,
      })
    }
    if (config.meta) {
      tags.push({
        tool: 'meta',
        id: config.meta,
        src: 'https://connect.facebook.net/en_US/fbevents.js',
      })
    }
    if (config.tiktok) {
      tags.push({
        tool: 'tiktok',
        id: config.tiktok,
        src: `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(config.tiktok)}&lib=ttq`,
      })
    }
  }
  return tags
}

/** GA4 recommended event names (ours already match for most). */
export function ga4EventName(name: EventName): string {
  switch (name) {
    case 'lead_submit':
      return 'generate_lead'
    case 'refund':
      return 'refund'
    default:
      return name
  }
}

/** Meta standard events; null = send as a custom event. */
export function metaEventName(name: EventName): string | null {
  switch (name) {
    case 'page_view':
      return 'PageView'
    case 'view_item':
    case 'itinerary_view':
    case 'package_view':
      return 'ViewContent'
    case 'add_to_cart':
      return 'AddToCart'
    case 'begin_checkout':
      return 'InitiateCheckout'
    case 'purchase':
      return 'Purchase'
    case 'lead_submit':
      return 'Lead'
    case 'whatsapp_click':
      return 'Contact'
    default:
      return null
  }
}

/** TikTok standard events; null = not sent. */
export function tiktokEventName(name: EventName): string | null {
  switch (name) {
    case 'view_item':
    case 'itinerary_view':
    case 'package_view':
      return 'ViewContent'
    case 'add_to_cart':
      return 'AddToCart'
    case 'begin_checkout':
      return 'InitiateCheckout'
    case 'purchase':
      return 'CompletePayment'
    case 'lead_submit':
      return 'SubmitForm'
    case 'whatsapp_click':
      return 'Contact'
    default:
      return null
  }
}

/** Minor units → major, from the currency's own exponent. */
export function toMajor(valueMinor: number, currency: string): number {
  return valueMinor / 10 ** minorUnitExponent(currency)
}
