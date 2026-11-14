/**
 * ItineraryCard — v3 `itineraryCard` (bt.js).
 *
 * Image 5:4 with the day count as a glass chip and the heart; title, blurb,
 * regions; then "PDF + map · $X" with "Details" and "Buy". `action` replaces
 * the default "Buy" button (pages pass the real buy/add control).
 */

import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { LinkButton } from '@/components/bt/button'
import {
  Card,
  CardActions,
  CardBody,
  CardFoot,
  CardMedia,
  CardMeta,
  CardText,
  CardTitle,
  formatPrice,
  PriceFrom,
} from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { Icon, type IconName } from '@/components/ui'
import { FavButton } from '@/components/bt/fav-button'
import type { Locale } from '@/i18n/config'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import type { ItinerarySummary } from '@/lib/content/types'
import { itineraryAudience, itineraryTitle } from '@/lib/itineraries/display'
import { fromPrice, pricedTiers } from '@/lib/itineraries/tiers'

const MAX_REGIONS = 3
const MAX_AUDIENCE = 3

export type ItineraryCardProps = {
  itinerary: ItinerarySummary
  /** Replaces the default "Buy" button — normally the buy/add-to-trip control. */
  action?: ReactNode
  priority?: boolean
  /**
   * Itineraries list (phase 2): the «وش بتحصل عليه» numbers, the «الأكثر
   * طلبًا» badge, and the map savings line («+ الخريطة بـ Y بدل Z — وفّر X»),
   * all prepared on the server. With `stats` the regions line is left out:
   * the list shows no place names before purchase.
   */
  stats?: readonly { icon: IconName; value: string; label: string }[]
  badge?: string | null
  extra?: ReactNode
  /**
   * «سمينياك · أوبود · أولواتو» — the areas the trip covers (owner, Nov
   * 2026): region names only, prepared on the server. Shown in both modes.
   */
  areas?: string
}

export function ItineraryCard({
  itinerary,
  action,
  priority = false,
  stats,
  badge = null,
  extra,
  areas = '',
}: ItineraryCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  // Clean title; the length and the audiences are chips (client, Oct 2026).
  const name = itineraryTitle(itinerary.name, itinerary.slug, itinerary.days, locale, t)
  const audience = itineraryAudience(itinerary.name, itinerary.audience, locale, t).slice(
    0,
    MAX_AUDIENCE,
  )
  const levels = pricedTiers(itinerary.tierPrices).length
  const priceMinor = fromPrice(itinerary.priceMinor, itinerary.tierPrices)
  const blurb = pickOptional(itinerary.blurb, locale)
  const regions = itinerary.regions
    .slice(0, MAX_REGIONS)
    .map((region) => pick(region.label, locale, region.key))
    .join(locale === 'ar' ? '، ' : ', ')

  return (
    <Card>
      <CardMedia
        src={itinerary.hero?.url}
        alt={pickAlt(itinerary.hero?.alt, locale, name)}
        srcSetAvif={itinerary.hero?.srcSetAvif}
        srcSetWebp={itinerary.hero?.srcSetWebp}
        ratio="5/4"
        priority={priority}
        badges={
          <>
            <Tag variant="glass" icon="cal">
              {t('c_days_n', { n: itinerary.days })}
            </Tag>
            {badge !== null && (
              <Tag variant="orange" icon="star">
                {badge}
              </Tag>
            )}
          </>
        }
        fav={<FavButton kind="itinerary" refId={itinerary.id} />}
      />
      <CardBody>
        <CardTitle href={itinerary.href}>{name}</CardTitle>
        {(audience.length > 0 || levels > 1) && (
          <div className="it-chips">
            {audience.map((label) => (
              <Tag key={label} variant="forest" className="it-chip">
                {label}
              </Tag>
            ))}
            {levels > 1 && (
              <Tag variant="orange" className="it-chip">
                {t('it_levels_n', { n: levels })}
              </Tag>
            )}
          </div>
        )}
        {blurb !== null && <CardText>{blurb}</CardText>}
        {stats !== undefined && areas !== '' && (
          <CardMeta items={[{ icon: 'pin', label: areas }]} />
        )}
        {stats !== undefined ? (
          stats.length > 0 && (
            <ul className="it-card-stats" role="list">
              {stats.map((stat) => (
                <li key={`${stat.icon}-${stat.value}`}>
                  <Icon name={stat.icon} size={14} />
                  <b dir="auto">{stat.value}</b> {stat.label}
                </li>
              ))}
            </ul>
          )
        ) : (
          <CardMeta items={regions === '' ? [] : [{ icon: 'pin', label: regions }]} />
        )}
        {extra}
        <CardFoot>
          <PriceFrom
            label={
              levels > 0 || stats !== undefined
                ? t('it_price_from')
                : // «PDF + map» only when the price really includes the map.
                  itinerary.includesMap === true
                  ? t('bt_pdf_map')
                  : t('bt_pdf_only')
            }
            amount={formatPrice(priceMinor, itinerary.currency, locale)}
            minor={priceMinor}
            currency={itinerary.currency}
          />
          <CardActions>
            <LinkButton
              href={itinerary.href}
              variant="ghost"
              size="sm"
              tabIndex={-1}
              aria-hidden="true"
            >
              {t('bt_details')}
            </LinkButton>
            {action ?? (
              <LinkButton href={itinerary.href} variant="primary" size="sm">
                {t('bt_buy_itin')}
              </LinkButton>
            )}
          </CardActions>
        </CardFoot>
      </CardBody>
    </Card>
  )
}
