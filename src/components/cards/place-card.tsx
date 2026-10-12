/**
 * PlaceCard.
 *
 * The list-view counterpart to a map pin, built from the `.bt-pcard` floating
 * card in design/handoff/sections-bt/page-map.jsx but on the shared `.card`
 * shell so it drops into any grid.
 *
 * The important difference from the handoff: a locked place is *not* a normal
 * card with a CSS blur over it. The prototype shipped the name, coordinates,
 * rating and image of every gated place to every browser and masked them with
 * `filter: blur(4px)` and a string of bullets, so the paywall was one devtools
 * panel away from irrelevant. This component's locked branch has nothing to
 * leak — `redactPlace()` strips the fields server-side, so the type itself
 * makes them unreachable.
 */

import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import { entityHref } from '@/lib/content/types'
import type { MapPlaceForClient } from '@/lib/entitlements/redaction'

/** Where an unentitled visitor goes to buy access. */
const PLANS_HREF = '/plans'

export type PlaceCardProps = {
  place: MapPlaceForClient
  priority?: boolean
}

export function PlaceCard({ place, priority = false }: PlaceCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  if (place.locked) {
    return (
      <article
        className="card bt-cardhover"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
      >
        <div
          className="card-pad"
          style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}
        >
          <span className="bt-paywall-ic">
            <Icon name="lock" size={20} color="#fff" />
          </span>
          <h3 style={{ fontSize: 17, textAlign: 'center' }}>{t('mp_locked')}</h3>
          <p
            className="muted"
            style={{ fontSize: 13, margin: 0, textAlign: 'center', lineHeight: 1.6 }}
          >
            {t('mp_locked_b')}
          </p>
          <LinkButton href={PLANS_HREF} variant="orange" size="sm" block>
            {t('mp_unlock')}
          </LinkButton>
        </div>
      </article>
    )
  }

  const name = pick(place.name, locale, place.slug)
  const category = pickOptional(place.category, locale)
  const description = pickOptional(place.description, locale)
  const href = entityHref('place', place.slug)

  return (
    <article className="card bt-cardhover" style={{ display: 'flex', flexDirection: 'column' }}>
      <Link href={href} className="bt-card-media" aria-label={name} tabIndex={-1}>
        <Photo src={place.heroImageUrl} alt="" priority={priority} style={{ height: 180 }} />
        {place.isFree && <span className="bt-card-badge">{t('mp_free')}</span>}
        {place.rating !== null && (
          <span className="bt-card-rate">
            ★ {format.number(place.rating, { maximumFractionDigits: 1 })}
          </span>
        )}
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
      >
        <h3 style={{ fontSize: 18, color: 'var(--forest)' }}>
          <Link href={href}>{name}</Link>
        </h3>

        {category !== null && (
          <Tag variant="palm" style={{ width: 'fit-content' }}>
            {category}
          </Tag>
        )}

        {description !== null && (
          <p className="muted" style={{ fontSize: 13.5, margin: 0, flex: 1 }}>
            {description}
          </p>
        )}

        {place.openingHours !== null && (
          <div
            className="muted"
            style={{ fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Icon name="clock" size={13} color="var(--muted)" /> {t('map_hours')}:{' '}
            {place.openingHours}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 'auto', paddingTop: 8 }}>
          <LinkButton href={href} variant="forest" size="sm" style={{ flex: 1 }}>
            {t('map_view')}
          </LinkButton>
          {place.activitySlug !== null && (
            <LinkButton
              href={entityHref('activity', place.activitySlug)}
              variant="ghost"
              size="sm"
              style={{ flex: 1 }}
            >
              {t('mp_detail')}
            </LinkButton>
          )}
        </div>
      </div>
    </article>
  )
}
