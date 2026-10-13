/**
 * ActivityCard.
 *
 * Ported from `ActivityCard` in design/handoff/bt-ui.jsx (lines 118-147).
 * Same markup, same classes, four corrections:
 *
 *  1. **It is a link.** The handoff wrapped the image and the title in
 *     `<button onClick={navigate}>`, which meant no href, no middle-click, no
 *     "open in new tab", and nothing for a crawler to follow. Both the image
 *     and the title are now real anchors to the same locale-prefixed URL.
 *  2. **The price is formatted.** `${a.price}` became a hard-coded dollar sign
 *     over a bare integer. Money is minor units plus a currency code, rendered
 *     through `formatMoney`.
 *  3. **The rating goes through the formatter**, so Arabic gets Arabic-Indic
 *     digits instead of a raw JS number.
 *  4. **The "add to trip" button is a slot.** The handoff hard-wired it to the
 *     cart context, which forced every card onto the client. `action` lets a
 *     page pass an interactive button in while the card itself stays a Server
 *     Component.
 *
 * No 'use client' — nothing here holds state.
 */

import type { ReactNode } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { LinkButton } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { ActivitySummary } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'

export type ActivityCardProps = {
  activity: ActivitySummary
  /** Rendered beside the "View details" CTA — normally an add-to-trip button. */
  action?: ReactNode
  /** Set on above-the-fold cards so the hero image is preloaded. */
  priority?: boolean
}

export function ActivityCard({ activity, action, priority = false }: ActivityCardProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()

  const name = pick(activity.name, locale, activity.slug)
  const area = pickOptional(activity.area, locale)
  const duration = pickOptional(activity.duration, locale)
  const category = activity.categories[0]
  const badge = category ? pick(category.label, locale, category.key) : null

  return (
    <article className="card bt-cardhover" style={{ display: 'flex', flexDirection: 'column' }}>
      {/*
        Second anchor to the same target. `tabIndex={-1}` keeps it out of the
        tab order so keyboard users get one stop per card, not two, while the
        pointer target stays the full image the design intends.
      */}
      <Link href={activity.href} className="bt-card-media" aria-label={name} tabIndex={-1}>
        <Photo
          src={activity.hero?.url}
          alt={pick(activity.hero?.alt, locale)}
          priority={priority}
          style={{ height: 190 }}
        />
        {badge !== null && <span className="bt-card-badge">{badge}</span>}
        {activity.rating !== null && (
          <span className="bt-card-rate">
            ★ {format.number(activity.rating, { maximumFractionDigits: 1 })}
          </span>
        )}
      </Link>

      <div
        className="card-pad"
        style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}
      >
        <h3 style={{ fontSize: 18, color: 'var(--forest)' }}>
          <Link href={activity.href}>{name}</Link>
        </h3>

        {(area !== null || duration !== null) && (
          <div
            className="muted"
            style={{
              fontSize: 13,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              flexWrap: 'wrap',
            }}
          >
            {area !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="pin" size={13} color="var(--muted)" /> {area}
              </span>
            )}
            {area !== null && duration !== null && <span>·</span>}
            {duration !== null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="clock" size={13} color="var(--muted)" /> {duration}
              </span>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginTop: 'auto',
            paddingTop: 10,
          }}
        >
          <div className="bt-card-price">
            <span className="bt-card-price-l">{t('c_from')}</span>
            <span>
              <span className="bt-card-price-v bt-money">
                {formatMoney(activity.priceMinor, activity.currency, locale)}
              </span>
              <span className="bt-card-price-u">{t('c_pp')}</span>
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <LinkButton href={activity.href} variant="forest" size="sm" style={{ flex: 1 }}>
            {t('c_view')}
          </LinkButton>
          {action}
        </div>
      </div>
    </article>
  )
}
