/**
 * PackageCard.
 *
 * Ported from `PackageCard` in design/handoff/bt-ui.jsx (lines 196-231).
 *
 * The title sits over the image inside the same anchor, as the design has it,
 * but it is an `<h3>` rather than a floating `<span>` so the card has a real
 * heading in the document outline.
 *
 * The handoff rendered amenity glyphs straight from the data (`<Icon
 * name={am} />`) and drew nothing when the name was not in the icon set. The
 * DTO filters unknown names out upstream, so the row only ever holds glyphs
 * that exist.
 */

import type { ReactNode } from 'react'
import { useTranslations, useLocale } from 'next-intl'

import { LinkButton, Tag } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { PackageSummary } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'

export type PackageCardProps = {
  pkg: PackageSummary
  /** Optional extra CTA — normally an add-to-trip button. */
  action?: ReactNode
  priority?: boolean
}

export function PackageCard({ pkg, action, priority = false }: PackageCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale

  const name = pick(pkg.name, locale, pkg.slug)
  const blurb = pickOptional(pkg.blurb, locale)

  return (
    <article className="card bt-cardhover" style={{ display: 'flex', flexDirection: 'column' }}>
      <Link href={pkg.href} className="bt-card-media">
        <Photo
          src={pkg.hero?.url}
          alt={pick(pkg.hero?.alt, locale)}
          priority={priority}
          style={{ height: 200 }}
        />
        <span className="bt-card-veil2" />
        <h3
          style={{
            position: 'absolute',
            insetInlineStart: 16,
            bottom: 14,
            color: '#fff',
            fontSize: 22,
            fontWeight: 800,
          }}
        >
          {name}
        </h3>
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}
      >
        {blurb !== null && (
          <p className="muted" style={{ fontSize: 14, margin: 0 }}>
            {blurb}
          </p>
        )}

        <div className="row" style={{ gap: 8 }}>
          <Tag variant="forest">
            <Icon name="cal" size={13} /> {pkg.days} {t('c_days')}
          </Tag>
          <Tag variant="palm">
            <Icon name="users" size={13} /> {t('ph_maxg')} {pkg.maxGuests}
          </Tag>
          {pkg.driverIncluded && (
            <Tag variant="orange">
              <Icon name="car" size={13} /> {t('dp_title')}
            </Tag>
          )}
        </div>

        {pkg.regions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span
              className="muted"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
              }}
            >
              {t('hp_regions')}:
            </span>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {pkg.regions.map((region) => pick(region.label, locale, region.key)).join(' · ')}
            </span>
          </div>
        )}

        {pkg.amenities.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              className="muted"
              style={{
                fontSize: 11.5,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '.05em',
              }}
            >
              {t('hp_services')}:
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              {pkg.amenities.map((amenity) => (
                <span key={amenity} className="bt-amen">
                  <Icon name={amenity} size={14} color="var(--forest)" />
                </span>
              ))}
            </span>
          </div>
        )}

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
          <div>
            <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
              {t('c_from')}{' '}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--orange-deep)' }}>
              {formatMoney(pkg.priceMinor, pkg.currency, locale)}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {action}
            <LinkButton href={pkg.href} variant="forest" size="sm">
              {t('hp_view')}
            </LinkButton>
          </div>
        </div>
      </div>
    </article>
  )
}
