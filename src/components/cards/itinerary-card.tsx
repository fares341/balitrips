/**
 * ItineraryCard.
 *
 * Ported from `ItineraryCard` in design/handoff/bt-ui.jsx (lines 149-175).
 *
 * The handoff resolved region tags through a `REGIONS` lookup table keyed by
 * an English string, and rendered `(REGIONS[r] || {})[lang]` — which silently
 * produced `undefined` for any region key not in that hard-coded map. Regions
 * are rows now, and the label travels with the DTO.
 *
 * The buy button is a slot: purchasing needs the cart, which needs the client.
 */

import type { ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'

import { LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { ItinerarySummary } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'

/** The design shows at most three region chips before the row wraps. */
const MAX_REGION_TAGS = 3

export type ItineraryCardProps = {
  itinerary: ItinerarySummary
  /** Rendered beside "View details" — normally the buy-and-download button. */
  action?: ReactNode
  priority?: boolean
}

export function ItineraryCard({ itinerary, action, priority = false }: ItineraryCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(itinerary.name, locale, itinerary.slug)
  const blurb = pickOptional(itinerary.blurb, locale)
  const tripType = pickOptional(itinerary.tripType, locale)

  return (
    <article className="card bt-cardhover" style={{ display: 'flex', flexDirection: 'column' }}>
      <Link href={itinerary.href} className="bt-card-media" aria-label={name} tabIndex={-1}>
        <Photo
          src={itinerary.hero?.url}
          alt={pick(itinerary.hero?.alt, locale)}
          priority={priority}
          style={{ height: 180 }}
        />
        <span className="bt-card-badge" style={{ background: 'var(--orange)', color: '#fff' }}>
          {itinerary.days} {t('c_days')}
        </span>
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
      >
        <h3 style={{ fontSize: 19 }}>
          <Link href={itinerary.href}>{name}</Link>
        </h3>

        {blurb !== null && (
          <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
            {blurb}
          </p>
        )}

        {itinerary.regions.length > 0 && (
          <div className="row" style={{ gap: 6 }}>
            {itinerary.regions.slice(0, MAX_REGION_TAGS).map((region) => (
              <Tag key={region.id} variant="forest" style={{ fontSize: 10.5 }}>
                {pick(region.label, locale, region.key)}
              </Tag>
            ))}
          </div>
        )}

        <div className="bt-itin-meta">
          {itinerary.spots !== null && (
            <span>
              <Icon name="pin" size={13} color="var(--muted)" /> {itinerary.spots} {t('hi_spots')}
            </span>
          )}
          {tripType !== null && (
            <span>
              <Icon name="tag" size={13} color="var(--muted)" /> {tripType}
            </span>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 10,
            marginTop: 'auto',
            paddingTop: 8,
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--orange-deep)' }}>
            {formatMoney(itinerary.priceMinor, itinerary.currency, locale)}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <LinkButton
            href={itinerary.href}
            variant="ghost"
            size="sm"
            style={{ flex: 1, fontSize: 12.5, paddingInline: 10 }}
          >
            {t('c_view')}
          </LinkButton>
          {action}
        </div>
      </div>
    </article>
  )
}
