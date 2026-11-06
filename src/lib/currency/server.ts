import { clientIp } from '@/lib/security/ip'

import { countryForIp } from './geoip'
import { currencyForCountry, type DisplayCurrency } from './shared'

/** Every currency a country maps to; the page runtime then applies the Studio list. */
const ANY_MAPPED = [
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'EGP',
  'JOD',
  'GBP',
  'IDR',
  'MYR',
  'SGD',
  'AUD',
  'CAD',
  'INR',
  'TRY',
  'JPY',
  'CNY',
  'USD',
  'EUR',
]

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
  // No CDN geo header (Caddy terminates TLS directly and writes the TCP peer
  // into X-Forwarded-For / X-Real-IP): resolve the client IP offline.
  const fromIp = countryForIp(clientIp(headers))
  if (fromIp !== null) return fromIp
  // Fallback: region subtag of the first Accept-Language entry ("ar-SA").
  const lang = headers.get('accept-language') ?? ''
  for (const part of lang.split(',')) {
    const match = /^[a-z]{2,3}[-_]([A-Za-z]{2})\b/.exec(part.trim())
    if (match?.[1]) return match[1].toUpperCase()
  }
  return null
}

/**
 * The currency for the visitor's country — SAR when the country is unknown
 * or unmapped, or (with `supported`) when its currency is not offered.
 */
export function detectCurrency(
  headers: Headers,
  supported: readonly string[] = ANY_MAPPED,
): DisplayCurrency {
  return currencyForCountry(detectCountry(headers), supported)
}
