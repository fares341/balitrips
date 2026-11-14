/**
 * «حتى 10 أيام: 300 ر.س» «حتى 15 يومًا: 400 ر.س» «حتى 20 يومًا: 500 ر.س» — one
 * chip per tier: the custom itinerary price tiers (`itinerarySales.customTripTiers`,
 * Studio → الجداول → الأسعار), shown wherever the custom trip is offered.
 * Server component; display only.
 */

import { getTranslations } from 'next-intl/server'

import { Money } from '@/components/currency/currency-context'
import { sortedTiers, type CustomTripTier } from '@/lib/itineraries/custom-tiers'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'

export async function loadCustomTripTiers(): Promise<CustomTripTier[]> {
  return sortedTiers((await readItinerarySales()).customTripTiers)
}

export async function CustomTripPrices({
  className = 'ct-prices',
  tiers,
}: {
  className?: string
  tiers?: CustomTripTier[]
}) {
  const [t, rows] = await Promise.all([getTranslations(), tiers ?? loadCustomTripTiers()])
  if (rows.length === 0) return null
  return (
    // One chip per tier («up to 10 days: 300»), not one long dotted sentence.
    <p className={className} aria-label={t('ct_tiers_label')}>
      {rows.map((tier, index) => (
        <span key={tier.maxDays} className="ct-tier">
          {t.rich(index === 0 ? 'ct_tier_first' : 'ct_tier_next', {
            days: tier.maxDays,
            price: () => (
              <b className="bt-money">
                <Money minor={tier.priceMinor} currency="SAR" />
              </b>
            ),
          })}
        </span>
      ))}
    </p>
  )
}
