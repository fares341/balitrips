/**
 * LandmarkCard — a landmark on /explore, in the v3 place-card shape.
 *
 * Opens the landmark's own place page (list H8), else its bookable activity,
 * else the map.
 */

import { useLocale, useTranslations } from 'next-intl'

import { Card, CardBody, CardMedia, CardText, CardTitle } from '@/components/bt/card'
import { Tag } from '@/components/bt/chip'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { ENTITY_PATHS, entityHref, type LandmarkDto } from '@/lib/content/types'

export type LandmarkCardProps = {
  landmark: LandmarkDto
  priority?: boolean
}

export function LandmarkCard({ landmark, priority = false }: LandmarkCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(landmark.name, locale, landmark.slug)
  const type = pickOptional(landmark.type, locale)
  const blurb = pickOptional(landmark.blurb, locale)
  const href =
    landmark.placeSlug !== null
      ? `/places/${landmark.placeSlug}`
      : landmark.activitySlug === null
        ? ENTITY_PATHS.place
        : entityHref('activity', landmark.activitySlug)

  return (
    <Card id={landmark.slug}>
      <CardMedia
        src={landmark.hero?.url}
        alt={pick(landmark.hero?.alt, locale)}
        srcSetAvif={landmark.hero?.srcSetAvif}
        srcSetWebp={landmark.hero?.srcSetWebp}
        priority={priority}
        badges={
          landmark.region !== null ? (
            <Tag variant="glass" icon="pin">
              {pick(landmark.region.label, locale, landmark.region.key)}
            </Tag>
          ) : null
        }
      />
      <CardBody>
        {type !== null && (
          <Tag variant="palm" style={{ alignSelf: 'flex-start' }}>
            {type}
          </Tag>
        )}
        <CardTitle href={href}>{name}</CardTitle>
        {blurb !== null && <CardText>{blurb}</CardText>}
        <span
          className="link"
          aria-hidden="true"
          style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
        >
          {t('hl_cta')} <Icon name="arrow" size={15} className="flip" />
        </span>
      </CardBody>
    </Card>
  )
}
