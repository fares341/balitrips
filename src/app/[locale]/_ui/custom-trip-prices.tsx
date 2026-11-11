/**
 * «يبدأ من 300 ر.س لجدول حتى 10 أيام · حتى 15 يوم 400 ر.س · حتى 20 يوم 500
 * ر.س» — the custom itinerary price tiers (`itinerarySales.customTripTiers`,
 * Studio → الجداول → الأسعار), shown wherever the custom trip is offered.
 * Server component; display only.
 */

import { Fragment } from 'react'
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
    <p className={className} aria-label={t('ct_tiers_label')}>
      {rows.map((tier, index) => (
        <Fragment key={tier.maxDays}>
          {index > 0 && <span aria-hidden="true"> · </span>}
          <span className="ct-tier">
            {t.rich(index === 0 ? 'ct_tier_first' : 'ct_tier_next', {
              days: tier.maxDays,
              price: () => (
                <b className="bt-money">
                  <Money minor={tier.priceMinor} currency="SAR" />
                </b>
              ),
            })}
          </span>
        </Fragment>
      ))}
    </p>
  )
}
