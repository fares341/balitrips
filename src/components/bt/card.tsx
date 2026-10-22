/**
 * Card primitives — bt.css "Cards".
 *
 *   <Card>
 *     <CardMedia src alt ratio badges={<Tag variant="glass">…</Tag>} fav={<FavButton …/>} />
 *     <CardBody>
 *       <CardMeta items={[{ icon: 'pin', label: 'Ubud' }]} end={<Stars value={4.6} count={94} />} />
 *       <CardTitle href="/activities/x">Title</CardTitle>
 *       <CardText>Short description</CardText>
 *       <CardFoot>
 *         <PriceFrom label="From" amount="$65" unit="person" />
 *         <CardActions>…buttons…</CardActions>
 *       </CardFoot>
 *     </CardBody>
 *   </Card>
 *
 * The whole card is clickable through ONE link — the title's — stretched over
 * the card with `::after` (`.card-link`). Buttons inside the card (heart, add
 * to trip, buy) sit above it (`.tr`, `.tl`, `.card-act` have z-index 2), so
 * the markup never nests interactive elements the way the prototype's
 * `<a class="card">…<button>` did, and every card still opens its own page.
 *
 * No 'use client'.
 */

import type { CSSProperties, ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Photo } from '@/components/ui/photo'
import { Link } from '@/i18n/routing'
import { minorUnitExponent, moneyLocale } from '@/lib/money'

export type CardProps = {
  children: ReactNode
  /** Lift + shadow + image zoom on hover (default true). */
  hoverable?: boolean
  className?: string
  id?: string
  style?: CSSProperties
}

export function Card({ children, hoverable = true, className, id, style }: CardProps) {
  return (
    <article
      id={id}
      style={style}
      className={['card', hoverable ? 'hoverable' : null, className].filter(Boolean).join(' ')}
    >
      {children}
    </article>
  )
}

export type CardRatio = '4/3' | '5/4' | '16/11' | '16/10'

const RATIO_CLASS: Record<CardRatio, string | null> = {
  '4/3': null,
  '5/4': 'r-5-4',
  '16/11': 'r-16-11',
  '16/10': 'r-16-10',
}

export type CardMediaProps = {
  src: string | null | undefined
  alt?: string
  /** 4/3 activity & place (default), 5/4 itinerary, 16/11 package, 16/10 article. */
  ratio?: CardRatio
  priority?: boolean
  srcSetAvif?: string | null
  srcSetWebp?: string | null
  /** Top-start chips (category, days, "Best first trip"). */
  badges?: ReactNode
  /** Top-end slot, normally a `<FavButton>`. */
  fav?: ReactNode
}

export function CardMedia({
  src,
  alt = '',
  ratio = '4/3',
  priority = false,
  srcSetAvif,
  srcSetWebp,
  badges,
  fav,
}: CardMediaProps) {
  return (
    <div className={['card-media', RATIO_CLASS[ratio]].filter(Boolean).join(' ')}>
      <Photo
        src={src}
        alt={alt}
        priority={priority}
        srcSetAvif={srcSetAvif}
        srcSetWebp={srcSetWebp}
        sizes="(min-width: 1240px) 400px, (min-width: 700px) 50vw, 100vw"
      />
      {badges !== undefined && badges !== null && <div className="tl">{badges}</div>}
      {fav !== undefined && fav !== null && <div className="tr">{fav}</div>}
    </div>
  )
}

export function CardBody({ children }: { children: ReactNode }) {
  return <div className="card-body">{children}</div>
}

export type CardTitleProps = {
  /** The card's destination. The link is stretched over the whole card. */
  href: string
  children: ReactNode
  as?: 'h2' | 'h3'
}

export function CardTitle({ href, children, as: Heading = 'h3' }: CardTitleProps) {
  return (
    <Heading className="card-title">
      <Link href={href} className="card-link">
        {children}
      </Link>
    </Heading>
  )
}

export function CardText({ children }: { children: ReactNode }) {
  return <p className="card-text">{children}</p>
}

export type CardMetaItem = { icon: IconName; label: ReactNode }

export type CardMetaProps = {
  items: readonly CardMetaItem[]
  /** Trailing element on the same row, e.g. `<Stars>`. */
  end?: ReactNode
}

export function CardMeta({ items, end }: CardMetaProps) {
  if (items.length === 0 && (end === undefined || end === null)) return null
  const meta = (
    <span className="card-meta">
      {items.map((item, index) => (
        <span key={index}>
          <Icon name={item.icon} size={15} /> {item.label}
        </span>
      ))}
    </span>
  )
  if (end === undefined || end === null) return meta
  return (
    <div className="row between" style={{ gap: 8 }}>
      {meta}
      {end}
    </div>
  )
}

/** Dashed rule, price at the start, actions at the end. */
export function CardFoot({ children }: { children: ReactNode }) {
  return <div className="card-foot">{children}</div>
}

/** Buttons in a card: raised above the stretched link so they act on their own. */
export function CardActions({ children }: { children: ReactNode }) {
  return <span className="card-acts card-act">{children}</span>
}

export type PriceFromProps = {
  /** Small line above the amount: "From", "PDF + map". */
  label?: ReactNode
  /** Already formatted, e.g. from `formatPrice`. */
  amount: string
  /** Unit after a slash: "person" → "$65 / person". */
  unit?: ReactNode
}

export function PriceFrom({ label, amount, unit }: PriceFromProps) {
  return (
    <div className="from">
      {label !== undefined && label !== null && <small>{label}</small>}
      <b>
        <bdi className="price" dir="ltr">
          {amount}
        </bdi>
        {unit !== undefined && unit !== null && <em> / {unit}</em>}
      </b>
    </div>
  )
}

export type StarsProps = {
  /** 0–5. Render nothing when there is no real rating. */
  value: number | null
  /** Number of reviews, shown in brackets when > 0. */
  count?: number
}

/** Orange star + rating (`.stars`). Never shown without a real rating. */
export function Stars({ value, count }: StarsProps) {
  if (value === null || !Number.isFinite(value)) return null
  return (
    <span className="stars" dir="ltr">
      <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="m12 3.5 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 17l-5.3 2.9 1.2-6-4.5-4.1 6-.7L12 3.5Z"
          fill="currentColor"
        />
      </svg>
      {value.toFixed(1)}
      {count !== undefined && count > 0 && (
        <span className="muted" style={{ fontWeight: 500 }}>
          ({count})
        </span>
      )}
    </span>
  )
}

/**
 * A price for display: currency symbol, Latin digits (the package shows
 * "$65" in Arabic too), and no ".00" on whole amounts.
 */
export function formatPrice(minor: number, currency: string, locale: string): string {
  const exponent = minorUnitExponent(currency)
  const value = minor / 10 ** exponent
  const whole = Number.isInteger(value)
  return new Intl.NumberFormat(locale === 'ar' ? 'en-US' : moneyLocale(locale, currency), {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: whole ? 0 : exponent,
    maximumFractionDigits: whole ? 0 : exponent,
  }).format(value)
}
