/**
 * One line of a trip.
 *
 * Shared by the cart and by the checkout review, because the two showing a
 * date or a party size differently is exactly how a customer ends up
 * believing they booked something other than what they paid for. The handoff
 * had no shared line at all — the cart rendered `it.meta[lang]`, a free-text
 * string baked into the fixture data, so nothing could be recomputed and
 * nothing was consistent.
 *
 * Server Components: no state, no handlers. The cart passes its stepper and
 * remove button in as `controls`, which is the only interactive part.
 */

import { getFormatter, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { Icon, Photo } from '@/components/ui'
import type { IconName } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import type { CartLineView } from '@/lib/cart'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import type { CartItemKind } from '@/lib/pricing/quote'

import { PriceBreakdown } from './price-breakdown'

/** Glyph per group, matching the handoff's `bt-cart-grouphead` icon map. */
export const TRIP_KIND_ICON: Record<CartItemKind, IconName> = {
  activity: 'compass',
  // A service level of an activity: same tour, richer inclusions.
  activity_tier: 'sparkle',
  driver: 'car',
  itinerary: 'cal',
  package: 'star',
  place: 'pin',
  plan: 'gem',
  custom: 'pdf',
}

/**
 * Shown *only* where there is genuinely no price.
 *
 * The handoff used this for every falsy subtotal, so a free group and an
 * unpriceable one looked identical. A real zero renders as formatted money.
 */
export const NO_PRICE = '—'

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * The muted line under the title: dates, time, party size, days.
 *
 * A travel date is a calendar date on the island, not an instant, so it is
 * pinned to UTC for formatting — `new Date('2026-08-10T00:00:00')` renders as
 * 9 August for a reader west of Greenwich.
 */
export async function tripLineMeta(line: CartLineView, locale: Locale): Promise<string> {
  const t = await getTranslations({ locale })
  const format = await getFormatter({ locale })

  const calendarDate = (value: string): string => {
    if (!PLAIN_DATE.test(value)) return value
    return format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })
  }

  const parts: string[] = []

  if (line.travelDate !== null) {
    const end = line.endDate
    parts.push(
      end !== null && end !== line.travelDate
        ? `${calendarDate(line.travelDate)} – ${calendarDate(end)}`
        : calendarDate(line.travelDate),
    )
  }

  if (line.travelTime !== null) parts.push(line.travelTime.slice(0, 5))

  if (line.kind === 'driver') {
    // Days come from the quote, which derives them from the range. The
    // handoff hardcoded one day whatever the dates said.
    if (line.pricedQuantity !== null) {
      parts.push(t('c_days_n', { n: line.pricedQuantity }))
    }
    if (line.guests !== null) parts.push(`${t('c_guests')}: ${format.number(line.guests)}`)
  } else if (line.kind === 'activity') {
    // For an activity, quantity is the guest count; `buildQuote` validates it
    // against the activity's own maximum.
    parts.push(`${t('c_guests')}: ${format.number(line.quantity)}`)
  } else if (line.guests !== null) {
    parts.push(`${t('c_guests')}: ${format.number(line.guests)}`)
  }
  if (line.children + line.infants > 0) {
    parts.push(
      t('trip_party_split', {
        adults: (line.guests ?? line.quantity) - line.children - line.infants,
        children: line.children,
        infants: line.infants,
      }),
    )
  }
  // Phase 2: how the booking gets confirmed, said before paying.
  if (line.confirmation !== null) {
    parts.push(
      line.confirmation.instant
        ? t('act_confirm_instant')
        : t('act_confirm_hours', { n: line.confirmation.hours }),
    )
  }

  return parts.join(' · ')
}

export type TripThumbProps = {
  line: CartLineView
  alt: string
  /** Edge length in px. 72 on the cart, smaller in the checkout review. */
  size?: number
}

/**
 * A driver has no catalogue row and therefore no photograph; it gets its glyph
 * on the same footprint rather than an empty box, so the row keeps its rhythm.
 */
export function TripThumb({ line, alt, size = 72 }: TripThumbProps) {
  const box = { width: size, height: size, flexShrink: 0 }

  if (line.imageUrl === null) {
    return (
      <span
        style={{
          ...box,
          borderRadius: 12,
          background: 'var(--ivory-2)',
          display: 'grid',
          placeItems: 'center',
        }}
        aria-hidden="true"
      >
        <Icon name={TRIP_KIND_ICON[line.kind]} size={Math.round(size / 3)} color="var(--muted)" />
      </span>
    )
  }

  return <Photo src={line.imageUrl} alt={alt} width={size} height={size} radius={12} style={box} />
}

export type TripLineProps = {
  line: CartLineView
  locale: Locale
  /** Stepper and remove button. Omitted in the checkout review. */
  controls?: ReactNode
  /** Thumbnail edge length. */
  size?: number
}

export async function TripLine({ line, locale, controls, size = 72 }: TripLineProps) {
  const t = await getTranslations({ locale })

  const resolved = pick(line.name, locale, '')
  // A locked map place withholds its name; fall back to the group label
  // rather than rendering an empty row or leaking what the map redacts.
  const title = resolved === '' ? t(`ct2_grp_${line.kind}`) : resolved
  const meta = await tripLineMeta(line, locale)

  const lineTotal = line.lineTotalMinor
  const currency = line.currency
  const priced = lineTotal !== null && currency !== null

  return (
    <article className="bt-cart-line">
      <TripThumb line={line} alt={pick(line.imageAlt, locale)} size={size} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>
          {line.href === null ? (
            title
          ) : (
            <Link href={line.href} style={{ color: 'inherit' }}>
              {title}
            </Link>
          )}
        </div>

        {meta !== '' && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            {meta}
          </div>
        )}

        {line.breakdown !== null && currency !== null && (
          <PriceBreakdown parts={line.breakdown} currency={currency} locale={locale} />
        )}

        {!priced && (
          <p className="bt-errmsg" style={{ marginTop: 6 }}>
            <Icon name="cross" size={12} color="var(--orange-ink)" />
            {t('ct2_line_off')}
          </p>
        )}

        {controls !== undefined && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginTop: 10,
              flexWrap: 'wrap',
            }}
          >
            {controls}
          </div>
        )}
      </div>

      <div
        style={{
          fontWeight: 800,
          fontSize: 16,
          color: 'var(--orange-ink)',
          whiteSpace: 'nowrap',
        }}
      >
        {priced ? formatMoney(lineTotal, currency, locale) : NO_PRICE}
      </div>
    </article>
  )
}
