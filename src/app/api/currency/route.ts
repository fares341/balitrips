import { NextResponse, type NextRequest } from 'next/server'

import { detectCountry, detectCurrency, getDisplayRates } from '@/lib/currency/server'
import { CURRENCY_COOKIE, isDisplayCurrency } from '@/lib/currency/shared'

/**
 * Display currency for this visitor + the cached USD rate table.
 *
 * Pages are static and edge-cached, so detection cannot happen in their
 * HTML; the client asks here once per load. A `bt_currency` cookie (the
 * switcher) overrides detection.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const chosen = request.cookies.get(CURRENCY_COOKIE)?.value
  const detected = detectCurrency(request.headers)
  const rates = await getDisplayRates()
  return NextResponse.json(
    {
      currency: isDisplayCurrency(chosen) ? chosen : detected,
      detected,
      country: detectCountry(request.headers),
      rates,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
