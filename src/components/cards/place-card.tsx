/**
 * PlaceCard — v3 `placeCard` (bt.js): places and restaurants.
 *
 * Image 4:3 with the category as a glass chip and the heart; area with the
 * real rating at the end; name; description. A locked place (not in the
 * visitor's plan) renders a lock card that leads to the plans instead — its
 * name and photo are never sent to the browser.
 */

import { useLocale, useTranslations } from 'next-intl'

import { LinkButton } from '@/components/bt/button'
import {
  Card,
  CardBody,
  CardMedia,
  CardMeta,
  CardText,
  CardTitle,
  Stars,
} from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { FavButton } from '@/components/bt/fav-button'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { MapPlaceForClient } from '@/lib/entitlements/redaction'

const PLANS_HREF = '/plans'

export type PlaceCardProps = {
  place: MapPlaceForClient
  priority?: boolean
  /**
   * Show the "Free preview" chip on free places (default). Off where every
   * card is free anyway (the home page's free-place sections).
   */
  showFree?: boolean
}

export function PlaceCard({ place, priority = false, showFree = true }: PlaceCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  if (place.locked) {
    return (
      <Card hoverable={false}>
        <div className="empty" style={{ flex: 1 }}>
          <span className="ill">
            <Icon name="lock" size={34} />
          </span>
          <b>{t('mp_locked')}</b>
          <p className="card-text">{t('mp_locked_b')}</p>
          <LinkButton href={PLANS_HREF} variant="primary" size="sm">
            {t('mp_unlock')}
          </LinkButton>
        </div>
      </Card>
    )
  }

  const name = pick(place.name, locale, place.slug)
  const category = pickOptional(place.category, locale)
  const description = pickOptional(place.description, locale)
  const area = pickOptional(place.regionLabel, locale)
  // The card opens the place's own page (photos, details, its mini map).
  const href = `/places/${encodeURIComponent(place.slug)}`

  return (
    <Card>
      <CardMedia
        src={place.heroImageUrl}
        priority={priority}
        badges={
          category !== null || (showFree && place.isFree) ? (
            <>
              {category !== null && <Tag variant="glass">{category}</Tag>}
              {showFree && place.isFree && <Tag variant="sun">{t('mp_free')}</Tag>}
            </>
          ) : null
        }
        fav={<FavButton kind="place" refId={place.id} />}
      />
      <CardBody>
        <CardMeta
          items={area === null ? [] : [{ icon: 'pin', label: area }]}
          end={<Stars value={place.rating} />}
        />
        <CardTitle href={href}>{name}</CardTitle>
        {description !== null && <CardText>{description}</CardText>}
      </CardBody>
    </Card>
  )
}
