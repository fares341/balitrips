/**
 * CompactCard — the clean, compact catalogue card (client revision 1).
 *
 *   photo (or icon) · optional small badge · title · 2-line description ·
 *   "from" price only when a real price exists · arrow
 *
 * Used for packages, itineraries, activities and driver vehicles, on their
 * listing pages and on the home page. The whole card opens its own page
 * through ONE link — the title's — stretched over the card (`.cc-link`), so
 * the favourite button can sit above it without nesting interactive elements.
 *
 * Layouts (bt.css "Compact cards"):
 *  - `auto` (default): a list row (thumbnail at the start) on phones, a tile
 *    (photo on top) from 600px;
 *  - `tile`: always a tile — horizontal scrollers and small 2-up grids;
 *  - `row`: always a list row — the activities list view.
 *
 * No 'use client': it renders inside Server Components and client islands alike.
 */

import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Photo } from '@/components/ui/photo'
import { Link } from '@/i18n/routing'

export type CompactCardLayout = 'auto' | 'tile' | 'row'

export type CompactCardImage = {
  src: string | null | undefined
  alt?: string
  srcSetAvif?: string | null
  srcSetWebp?: string | null
}

export type CompactCardPrice = {
  /** "From" — small text before the amount. */
  label: string
  /** Already formatted (formatPrice). Rendered LTR. */
  amount: string
  /** "person", "day"… after a slash. */
  unit?: string | null
}

export type CompactCardProps = {
  href: string
  title: string
  description?: string | null
  /** A photo. When absent (or no src) the icon is shown instead. */
  image?: CompactCardImage | null
  icon?: IconName
  /** Small pill over the media: a step number, "5 days", a category. */
  badge?: ReactNode
  /** One short line above the title: area · duration. */
  meta?: ReactNode
  /** Real price only — omit when the item has none. */
  price?: CompactCardPrice | null
  /** Trailing element of the footer row, e.g. `<Stars>` with a real rating. */
  end?: ReactNode
  /** Normally a `<FavButton>`; raised above the stretched link. */
  fav?: ReactNode
  layout?: CompactCardLayout
  priority?: boolean
  as?: 'h2' | 'h3'
  className?: string
}

export function CompactCard({
  href,
  title,
  description,
  image,
  icon = 'compass',
  badge,
  meta,
  price,
  end,
  fav,
  layout = 'auto',
  priority = false,
  as: Heading = 'h3',
  className,
}: CompactCardProps) {
  const hasPhoto = image !== undefined && image !== null && Boolean(image.src)
  const hasBadge = badge !== undefined && badge !== null && badge !== false
  const hasMeta = meta !== undefined && meta !== null && meta !== false
  const hasEnd = end !== undefined && end !== null && end !== false

  return (
    <article
      className={['cc', `cc-${layout}`, hasPhoto ? null : 'cc-noimg', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="cc-media">
        {hasPhoto ? (
          <Photo
            src={image.src}
            alt={image.alt ?? ''}
            priority={priority}
            srcSetAvif={image.srcSetAvif}
            srcSetWebp={image.srcSetWebp}
            sizes="(min-width: 1200px) 300px, (min-width: 600px) 45vw, 120px"
          />
        ) : (
          <span className="cc-ic" aria-hidden="true">
            <Icon name={icon} size={24} />
          </span>
        )}
        {hasBadge && <span className="cc-badge">{badge}</span>}
      </div>

      <div className="cc-body">
        {hasMeta && <p className="cc-meta">{meta}</p>}
        <Heading className="cc-title">
          <Link href={href} className="cc-link">
            {title}
          </Link>
        </Heading>
        {description !== undefined && description !== null && description !== '' && (
          <p className="cc-desc">{description}</p>
        )}
        <div className="cc-foot">
          {price !== undefined && price !== null ? (
            <span className="cc-price">
              <small>{price.label}</small>{' '}
              <b>
                <bdi dir="ltr">{price.amount}</bdi>
              </b>
              {price.unit !== undefined && price.unit !== null && (
                <small className="cc-unit"> / {price.unit}</small>
              )}
            </span>
          ) : (
            <span />
          )}
          {hasEnd && <span className="cc-end">{end}</span>}
          <span className="cc-go" aria-hidden="true">
            <Icon name="arrow" size={16} stroke={2.2} className="flip" />
          </span>
        </div>
      </div>

      {fav !== undefined && fav !== null && <div className="cc-fav">{fav}</div>}
    </article>
  )
}
