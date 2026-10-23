import 'server-only'

import {
  currencyForCountry,
  DISPLAY_CURRENCIES,
  FALLBACK_RATES,
  type DisplayCurrency,
} from './shared'

/**
 * Exchange rates for display, refreshed at most every 12 hours from a free,
 * key-less feed. Any failure keeps the last good table, or the fallback.
 */
const RATES_URL = 'https://open.er-api.com/v6/latest/USD'
const TTL_MS = 12 * 60 * 60 * 1000

let cache: { at: number; rates: Record<DisplayCurrency, number> } | null = null
let inflight: Promise<Record<DisplayCurrency, number>> | null = null

async function fetchRates(): Promise<Record<DisplayCurrency, number>> {
  const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(4000), cache: 'no-store' })
  if (!res.ok) throw new Error(`rates ${res.status}`)
  const body = (await res.json()) as { result?: string; rates?: Record<string, unknown> }
  if (body.result !== 'success' || !body.rates) throw new Error('rates: bad payload')
  const out = { ...FALLBACK_RATES }
  for (const code of DISPLAY_CURRENCIES) {
    const value = body.rates[code]
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) out[code] = value
  }
  out.USD = 1
  return out
}

export async function getDisplayRates(): Promise<Record<DisplayCurrency, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rates
  inflight ??= fetchRates()
    .then((rates) => {
      cache = { at: Date.now(), rates }
      return rates
    })
    .catch(() => {
      // Back off for an hour before retrying a failing feed.
      const rates = cache?.rates ?? { ...FALLBACK_RATES }
      cache = { at: Date.now() - TTL_MS + 60 * 60 * 1000, rates }
      return rates
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

/**
 * Visitor country from edge headers. Cloudflare (orange cloud) sends
 * `cf-ipcountry`; Vercel and other CDNs use their own names. None is a
 * security input — a spoofed value only changes an informational price.
 */
const COUNTRY_HEADERS = [
  'cf-ipcountry',
  'x-vercel-ip-country',
  'cloudfront-viewer-country',
  'x-country-code',
  'x-geo-country',
]

export function detectCountry(headers: Headers): string | null {
  for (const name of COUNTRY_HEADERS) {
    const value = headers.get(name)?.trim().toUpperCase()
    // Cloudflare uses XX (unknown) and T1 (Tor).
    if (value && /^[A-Z]{2}$/.test(value) && value !== 'XX' && value !== 'T1') return value
  }
  // Fallback: region subtag of the first Accept-Language entry ("ar-SA").
  const lang = headers.get('accept-language') ?? ''
  for (const part of lang.split(',')) {
    const match = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(part.trim())
    if (match?.[1]) return match[1].toUpperCase()
  }
  return null
}

export function detectCurrency(headers: Headers): DisplayCurrency {
  return currencyForCountry(detectCountry(headers))
}
