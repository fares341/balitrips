import type { NextRequest, NextResponse } from 'next/server'

import { detectCurrency } from './server'
import { GEO_CURRENCY_COOKIE, LEGACY_CURRENCY_COOKIE } from './shared'

/**
 * Display currency, decided on the server (owner, Nov 2026): the visitor's
 * country (CDN geo header, else the offline IP table, else Accept-Language)
 * mapped to a currency, handed to the page in a small readable cookie. The
 * HTML itself stays identical for everyone, so pages remain static; the
 * inline runtime in <head> converts the prices before first paint. Set once
 * a day and only when the switcher has not chosen (its cookie wins).
 */
export function withGeoCurrency(request: NextRequest, response: NextResponse): NextResponse {
  // Pre-v2 override: set by the old switcher and pinned visitors for a year.
  if (request.cookies.has(LEGACY_CURRENCY_COOKIE)) {
    response.cookies.set(LEGACY_CURRENCY_COOKIE, '', { path: '/', maxAge: 0 })
  }
  try {
    // Detected on every page request (the table lookup is in memory) and
    // written whenever the stored value is missing or no longer matches, so
    // a cached/prerendered page still gets the right cookie and a visitor
    // who changes country is not stuck with yesterday's guess. The switcher
    // cookie, when present, still wins in the page runtime.
    const detected = detectCurrency(request.headers)
    if (request.cookies.get(GEO_CURRENCY_COOKIE)?.value !== detected) {
      response.cookies.set(GEO_CURRENCY_COOKIE, detected, {
        path: '/',
        maxAge: 60 * 60 * 24,
        sameSite: 'lax',
        httpOnly: false,
      })
    }
  } catch {
    // Detection is best effort: no cookie means SAR.
  }
  return response
}
