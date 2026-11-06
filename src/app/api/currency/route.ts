import { NextResponse, type NextRequest } from 'next/server'

import { readFx } from '@/lib/currency/fx-store'
import { detectCountry, detectCurrency } from '@/lib/currency/server'
import { CURRENCY_COOKIE, isDisplayCurrency } from '@/lib/currency/shared'

/**
 * Display currency for this visitor + the Studio SAR→X table (diagnostics and
 * any client that needs the numbers). Pages no longer depend on it: the
 * proxy decides the currency and the inline runtime applies it.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const fx = await readFx()
  const chosen = request.cookies.get(CURRENCY_COOKIE)?.value?.toUpperCase()
  const detected = detectCurrency(request.headers, fx.presentment)
  return NextResponse.json(
    {
      base: fx.base,
      currency: isDisplayCurrency(chosen, fx.presentment) ? chosen : detected,
      detected,
      country: detectCountry(request.headers),
      rates: fx.rates,
      supported: fx.presentment,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
