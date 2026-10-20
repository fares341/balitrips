/**
 * Campaign attribution (UTM) — pure, shared by the browser and the server.
 *
 * On landing, the visitor's campaign is read from the URL
 * (`utm_source/utm_medium/utm_campaign`) or, without one, from the site that
 * sent them (a search engine or social network). Two touches are kept:
 *
 *  - first touch: the very first campaign we saw for this visitor id;
 *  - last touch:  the most recent NON-direct campaign — typing the address
 *                 later does not erase the ad that brought them.
 *
 * Kept in first-party cookies only after the visitor allowed analytics, then
 * copied onto `visitor_attribution` and onto the order at checkout.
 */

export interface Touch {
  source: string
  medium: string | null
  campaign: string | null
}

export const ANON_COOKIE = 'bt_aid'
export const SESSION_COOKIE = 'bt_sid'
export const FIRST_TOUCH_COOKIE = 'bt_utm_f'
export const LAST_TOUCH_COOKIE = 'bt_utm_l'
/** 13 months, the longest a visitor id is kept. */
export const ANON_MAX_AGE_SECONDS = 395 * 24 * 60 * 60
/** A session ends after 30 minutes without a page. */
export const SESSION_MAX_AGE_SECONDS = 30 * 60

const MAX = 100

/** Lowercase, trimmed, only safe characters, at most 100 long. Empty → null. */
export function cleanUtmValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}._\-+ ]/gu, '')
    .replace(/\s+/g, '_')
    .slice(0, MAX)
  return cleaned === '' ? null : cleaned
}

const SEARCH = ['google', 'bing', 'yahoo', 'duckduckgo', 'yandex', 'baidu', 'ecosia']
const SOCIAL: Record<string, string> = {
  'facebook.com': 'facebook',
  'fb.com': 'facebook',
  'm.facebook.com': 'facebook',
  'l.facebook.com': 'facebook',
  'instagram.com': 'instagram',
  'l.instagram.com': 'instagram',
  't.co': 'twitter',
  'twitter.com': 'twitter',
  'x.com': 'twitter',
  'tiktok.com': 'tiktok',
  'youtube.com': 'youtube',
  'snapchat.com': 'snapchat',
  'linkedin.com': 'linkedin',
  'pinterest.com': 'pinterest',
  'wa.me': 'whatsapp',
  'web.whatsapp.com': 'whatsapp',
}

/**
 * The campaign of a landing, or null when there is nothing to record
 * (internal navigation, or direct with no referrer).
 */
export function touchFromLanding(
  search: string,
  referrer: string | null | undefined,
  ownHost: string,
): Touch | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const source = cleanUtmValue(params.get('utm_source'))
  if (source !== null) {
    return {
      source,
      medium: cleanUtmValue(params.get('utm_medium')),
      campaign: cleanUtmValue(params.get('utm_campaign')),
    }
  }
  // Click ids without UTM tags: still the ad platform.
  if (params.get('gclid')) return { source: 'google', medium: 'cpc', campaign: null }
  if (params.get('fbclid')) return { source: 'facebook', medium: 'social', campaign: null }
  if (params.get('ttclid')) return { source: 'tiktok', medium: 'cpc', campaign: null }

  if (!referrer) return null
  let host: string
  try {
    host = new URL(referrer).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  const own = ownHost.toLowerCase().replace(/^www\./, '')
  if (host === '' || host === own) return null
  const engine = SEARCH.find((name) => host === `${name}.com` || host.startsWith(`${name}.`))
  if (engine) return { source: engine, medium: 'organic', campaign: null }
  const social = SOCIAL[host]
  if (social) return { source: social, medium: 'social', campaign: null }
  return { source: host.slice(0, MAX), medium: 'referral', campaign: null }
}

/** `source|medium|campaign`, cookie-safe. */
export function encodeTouch(touch: Touch): string {
  return [touch.source, touch.medium ?? '', touch.campaign ?? '']
    .map((part) => encodeURIComponent(part))
    .join('|')
}

export function decodeTouch(value: string | null | undefined): Touch | null {
  if (typeof value !== 'string' || value === '') return null
  const [source, medium, campaign] = value.split('|').map((part) => {
    try {
      return cleanUtmValue(decodeURIComponent(part))
    } catch {
      return null
    }
  })
  if (!source) return null
  return { source, medium: medium ?? null, campaign: campaign ?? null }
}

/**
 * A campaign link: the page URL with the three UTM tags (Studio's link
 * builder). Existing UTM tags on the URL are replaced.
 */
export function buildCampaignUrl(
  base: string,
  tags: { source: string; medium: string; campaign: string; content?: string },
): string | null {
  let url: URL
  try {
    url = new URL(base)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const source = cleanUtmValue(tags.source)
  if (source === null) return null
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']) {
    url.searchParams.delete(key)
  }
  url.searchParams.set('utm_source', source)
  const medium = cleanUtmValue(tags.medium)
  if (medium) url.searchParams.set('utm_medium', medium)
  const campaign = cleanUtmValue(tags.campaign)
  if (campaign) url.searchParams.set('utm_campaign', campaign)
  const content = cleanUtmValue(tags.content)
  if (content) url.searchParams.set('utm_content', content)
  return url.toString()
}

/** Label for reports: `google / cpc`, `(direct)`. */
export function sourceLabel(source: string | null, medium: string | null): string {
  if (!source) return '(direct)'
  return medium ? `${source} / ${medium}` : source
}
