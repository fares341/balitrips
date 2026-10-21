/**
 * My Trip → "Your itineraries" (phase 3): every itinerary the traveller paid
 * for, day by day, with the places of each day in order and a link to see
 * that day on the map. Places are redacted for the traveller's own access —
 * a locked one is a numbered lock and an upgrade link. An itinerary sold with
 * "VIP later" offers the upgrade here while the traveller has no VIP.
 */

import { getFormatter, getTranslations } from 'next-intl/server'

import { DayStops } from '@/components/trip/day-stops'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { loadEntitlements } from '@/lib/entitlements'
import {
  holdsVip,
  itineraryPlans,
  loadDayStops,
  ownedItineraryIds,
  vipPlanOffer,
} from '@/lib/itineraries/queries'

import { formatPrice } from '../../_ui/price'
import { VipUpgradeButton } from './vip-upgrade'

export async function ItineraryPlans({ userId, locale }: { userId: string; locale: Locale }) {
  const plans = await itineraryPlans(await ownedItineraryIds(userId))
  if (plans.length === 0) return null

  const [t, format, held, vip] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    loadEntitlements(userId),
    holdsVip(userId),
  ])
  const stops = await loadDayStops(
    plans.flatMap((plan) => plan.days.map((day) => day.id)),
    held,
  )

  return (
    <section className="it-mine" aria-labelledby="it-mine-h">
      <h2 id="it-mine-h" className="h3">
        {t('p3_my_itins')}
      </h2>
      {await Promise.all(
        plans.map(async (plan) => {
          const name = pick(plan.name, locale, plan.slug)
          const offer =
            plan.mapAccess === 'vip_later' && !vip
              ? await vipPlanOffer(plan.vipPlanId, userId)
              : null
          const withPlaces = plan.days.filter((day) => (stops.get(day.id) ?? []).length > 0)
          return (
            <details key={plan.id} className="card it-mine-card" open={plans.length === 1}>
              <summary>
                <Icon name="route" size={18} color="var(--forest)" />
                <b>{name}</b>
                <small className="muted">{t('c_days_n', { n: plan.days.length })}</small>
              </summary>
              {offer !== null && (
                <div className="it-mine-vip" role="note">
                  <span>
                    <b>{t('p3_vip_later_t')}</b>
                    <small className="muted">{t('p3_vip_later_b')}</small>
                  </span>
                  <VipUpgradeButton
                    planId={offer.planId}
                    label={t('p3_vip_later_cta', {
                      price: formatPrice(offer.priceMinor, offer.currency, locale),
                    })}
                  />
                </div>
              )}
              {withPlaces.length === 0 ? (
                <p className="muted" style={{ margin: 0 }}>
                  {t('p3_my_itin_no_places')}{' '}
                  <Link href={`/itineraries/${plan.slug}`}>{t('p3_open_itinerary')}</Link>
                </p>
              ) : (
                <ol className="it-mine-days">
                  {withPlaces.map((day) => (
                    <li key={day.id}>
                      <b className="it-mine-day">
                        {t('dt_day_n')} {format.number(day.dayNumber)}
                        {pickOptional(day.title, locale) !== null &&
                          ` · ${pickOptional(day.title, locale)}`}
                      </b>
                      <DayStops
                        stops={stops.get(day.id) ?? []}
                        locale={locale}
                        mapHref={`/map?itinerary=${encodeURIComponent(plan.slug)}&day=${day.dayNumber}`}
                      />
                    </li>
                  ))}
                </ol>
              )}
            </details>
          )
        }),
      )}
    </section>
  )
}
