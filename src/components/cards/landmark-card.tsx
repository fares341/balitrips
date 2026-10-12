/**
 * LandmarkCard.
 *
 * Ported from `LandmarkCard` in design/handoff/bt-ui.jsx (lines 177-194).
 *
 * A landmark is editorial, not bookable: it points at the activity that sells
 * it when there is one, and at the interactive map when there is not. The
 * handoff made that decision from `l.actId` alone, which sent visitors to a
 * detail page for an activity that might have been unpublished since; the
 * query only fills `activitySlug` when the activity is live, so the fallback
 * is now correct rather than optimistic.
 */

import { useTranslations, useLocale } from 'next-intl'

import { LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
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
    landmark.activitySlug === null
      ? ENTITY_PATHS.place
      : entityHref('activity', landmark.activitySlug)

  return (
    <article
      className="card bt-cardhover"
      id={landmark.slug}
      style={{ display: 'flex', flexDirection: 'column' }}
    >
      <Link href={href} className="bt-card-media" aria-label={name} tabIndex={-1}>
        <Photo
          src={landmark.hero?.url}
          alt={pick(landmark.hero?.alt, locale)}
          priority={priority}
          style={{ height: 190 }}
        />
        {landmark.region !== null && (
          <span className="bt-card-badge">
            {pick(landmark.region.label, locale, landmark.region.key)}
          </span>
        )}
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
      >
        <h3 style={{ fontSize: 19 }}>
          <Link href={href}>{name}</Link>
        </h3>

        {type !== null && (
          <Tag variant="palm" style={{ width: 'fit-content' }}>
            {type}
          </Tag>
        )}

        {blurb !== null && (
          <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>
            {blurb}
          </p>
        )}

        <LinkButton href={href} variant="forest" size="sm" style={{ marginTop: 6 }}>
          {t('hl_cta')} <Icon name="arrow" size={15} color="#fff" className="flip" />
        </LinkButton>
      </div>
    </article>
  )
}
