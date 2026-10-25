/**
 * Catalogue → CompactCard (client revision 1).
 *
 * One mapper per content type, so the listing pages and the home page show
 * the same compact card for the same record. Real data only: a rating is
 * shown only when one exists, a price only from the record itself.
 */

import { itineraryTitle } from '@/lib/itineraries/display'
import { fromPrice, pricedTiers } from '@/lib/itineraries/tiers'
import { useLocale, useTranslations } from 'next-intl'

import { formatPrice, Stars } from '@/components/bt/card'
import { CompactCard, type CompactCardLayout } from '@/components/bt/compact-card'
import { FavButton } from '@/components/bt/fav-button'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { ActivitySummary, ItinerarySummary, PackageSummary } from '@/lib/content/types'
import { FEATURES } from '@/lib/features'

type Common = {
  layout?: CompactCardLayout
  priority?: boolean
  /** Hide the heart (e.g. inside a dense home strip). Default: shown. */
  fav?: boolean
  /** A step / rank number shown as the badge instead of the default one. */
  badge?: string | null
}

const SEP = ' · '

export function ActivityCompact({
  activity,
  layout,
  priority,
  fav = true,
  badge,
}: Common & { activity: ActivitySummary }) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const category = activity.categories[0]
  const meta = [pickOptional(activity.area, locale), pickOptional(activity.duration, locale)]
    .filter((part): part is string => part !== null)
    .join(SEP)

  return (
    <CompactCard
      href={activity.href}
      title={pick(activity.name, locale, activity.slug)}
      description={pickOptional(activity.blurb, locale)}
      image={{
        src: activity.hero?.url,
        alt: pick(activity.hero?.alt, locale),
        srcSetAvif: activity.hero?.srcSetAvif,
        srcSetWebp: activity.hero?.srcSetWebp,
      }}
      badge={badge ?? (category ? pick(category.label, locale, category.key) : null)}
      meta={meta === '' ? null : meta}
      price={
        activity.priceMinor > 0
          ? {
              label: t('bt_from'),
              amount: formatPrice(activity.priceMinor, activity.currency, locale),
              unit: t('bt_per_person'),
            }
          : null
      }
      end={<Stars value={activity.rating} />}
      fav={fav ? <FavButton kind="activity" refId={activity.id} /> : null}
      layout={layout}
      priority={priority}
    />
  )
}

export function PackageCompact({
  pkg,
  layout,
  priority,
  fav = true,
  badge,
}: Common & { pkg: PackageSummary }) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const region = pkg.regions[0]
  const meta = [
    region !== undefined ? pick(region.label, locale, region.key) : null,
    FEATURES.driver ? t(pkg.driverIncluded ? 'bt_driver_included' : 'bt_no_driver') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(SEP)

  return (
    <CompactCard
      href={pkg.href}
      title={pick(pkg.name, locale, pkg.slug)}
      description={pickOptional(pkg.blurb, locale)}
      image={{
        src: pkg.hero?.url,
        alt: pick(pkg.hero?.alt, locale),
        srcSetAvif: pkg.hero?.srcSetAvif,
        srcSetWebp: pkg.hero?.srcSetWebp,
      }}
      icon="box"
      badge={badge ?? t('c_days_n', { n: pkg.days })}
      meta={meta}
      price={
        pkg.priceMinor > 0
          ? {
              label: t('bt_from'),
              amount: formatPrice(pkg.priceMinor, pkg.currency, locale),
              unit: pkg.pricingMode === 'per_guest' ? t('bt_per_person') : null,
            }
          : null
      }
      fav={fav ? <FavButton kind="package" refId={pkg.id} /> : null}
      layout={layout}
      priority={priority}
    />
  )
}

/** How many region names the meta line lists before it is cut. */
const MAX_REGIONS = 2

export function ItineraryCompact({
  itinerary,
  layout,
  priority,
  fav = true,
  badge,
}: Common & { itinerary: ItinerarySummary }) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const regions = itinerary.regions
    .slice(0, MAX_REGIONS)
    .map((region) => pick(region.label, locale, region.key))
    .join(locale === 'ar' ? '، ' : ', ')

  return (
    <CompactCard
      href={itinerary.href}
      title={itineraryTitle(itinerary.name, itinerary.slug, itinerary.days, locale, t)}
      description={pickOptional(itinerary.blurb, locale)}
      image={{
        src: itinerary.hero?.url,
        alt: pick(itinerary.hero?.alt, locale),
        srcSetAvif: itinerary.hero?.srcSetAvif,
        srcSetWebp: itinerary.hero?.srcSetWebp,
      }}
      icon="doc"
      badge={badge ?? t('c_days_n', { n: itinerary.days })}
      meta={regions === '' ? null : regions}
      price={
        itinerary.priceMinor > 0
          ? {
              label:
                pricedTiers(itinerary.tierPrices).length > 0 ? t('it_price_from') : t('bt_pdf_map'),
              amount: formatPrice(
                fromPrice(itinerary.priceMinor, itinerary.tierPrices),
                itinerary.currency,
                locale,
              ),
            }
          : null
      }
      fav={fav ? <FavButton kind="itinerary" refId={itinerary.id} /> : null}
      layout={layout}
      priority={priority}
    />
  )
}
