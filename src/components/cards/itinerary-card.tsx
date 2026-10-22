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
import { FavButton } from '@/components/bt/fav-button'
import type { Locale } from '@/i18n/config'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import type { ItinerarySummary } from '@/lib/content/types'

const MAX_REGIONS = 3

export type ItineraryCardProps = {
  itinerary: ItinerarySummary
  /** Replaces the default "Buy" button — normally the buy/add-to-trip control. */
  action?: ReactNode
  priority?: boolean
}

export function ItineraryCard({ itinerary, action, priority = false }: ItineraryCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(itinerary.name, locale, itinerary.slug)
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
          <Tag variant="glass" icon="cal">
            {t('c_days_n', { n: itinerary.days })}
          </Tag>
        }
        fav={<FavButton kind="itinerary" refId={itinerary.id} />}
      />
      <CardBody>
        <CardTitle href={itinerary.href}>{name}</CardTitle>
        {blurb !== null && <CardText>{blurb}</CardText>}
        <CardMeta items={regions === '' ? [] : [{ icon: 'pin', label: regions }]} />
        <CardFoot>
          <PriceFrom
            label={t('bt_pdf_map')}
            amount={formatPrice(itinerary.priceMinor, itinerary.currency, locale)}
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
