/**
 * Photo tiles from the package that are not catalogue cards.
 *
 *  - `ServiceTile` (services.html `.svc a`): 16:9 photo, a forest icon badge
 *    overlapping its bottom edge, an optional orange "Signature" chip, the
 *    name, one line, and a forest button. Lay several out in `<ServiceGrid>`.
 *  - `RegionCard` (bt.js `regionCard`): full-bleed photo with a forest veil,
 *    the area's name, one line, and "Explore area →" in palm green.
 *
 * Both are single links (no inner controls). No 'use client'.
 */

import type { ReactNode } from 'react'

import { Icon, type IconName } from '@/components/ui/icon'
import { Photo } from '@/components/ui/photo'
import { Link } from '@/i18n/routing'

export type ServiceTileProps = {
  href: string
  /** Photo URL, e.g. '/brand/driver-car.webp'. */
  image: string
  icon: IconName
  title: ReactNode
  description: ReactNode
  /** Button text at the bottom, e.g. "Book a driver". */
  cta: ReactNode
  /** Orange chip on the photo ("Signature"). */
  badge?: ReactNode
  as?: 'h2' | 'h3'
  priority?: boolean
}

export function ServiceTile({
  href,
  image,
  icon,
  title,
  description,
  cta,
  badge,
  as: Heading = 'h2',
  priority = false,
}: ServiceTileProps) {
  return (
    <Link href={href} className="svc-tile">
      <div className="m">
        <div className="m-clip">
          <Photo src={image} alt="" priority={priority} />
        </div>
        {badge !== undefined && badge !== null && <span className="usp tag tag-sun">{badge}</span>}
        <span className="ic">
          <Icon name={icon} size={26} />
        </span>
      </div>
      <div className="b">
        <Heading>{title}</Heading>
        <p className="muted">{description}</p>
        <span className="btn btn-forest btn-sm">
          {cta} <Icon name="arrow" size={16} className="flip" />
        </span>
      </div>
    </Link>
  )
}

export function ServiceGrid({ children }: { children: ReactNode }) {
  return <div className="svc">{children}</div>
}

export type RegionCardProps = {
  href: string
  image: string | null | undefined
  name: ReactNode
  tagline?: ReactNode
  /** "Explore area" — already translated. */
  cta: ReactNode
  /** 3:4 instead of 4:3. */
  tall?: boolean
  priority?: boolean
}

export function RegionCard({
  href,
  image,
  name,
  tagline,
  cta,
  tall = false,
  priority = false,
}: RegionCardProps) {
  return (
    <Link
      href={href}
      className={['card', 'hoverable', 'region-card', tall ? 'tall' : null]
        .filter(Boolean)
        .join(' ')}
    >
      <Photo src={image} alt="" priority={priority} />
      <span className="veil" aria-hidden="true" />
      <span className="cap">
        <b>{name}</b>
        {tagline !== undefined && tagline !== null && <span className="sub">{tagline}</span>}
        <span className="go">
          {cta} <Icon name="arrow" size={15} className="flip" />
        </span>
      </span>
    </Link>
  )
}
