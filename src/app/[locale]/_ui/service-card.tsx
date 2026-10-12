/**
 * ServiceCard — the pillar tile used by the homepage's five-up grid and the
 * services page's six-up grid.
 *
 * Ported from `ServiceCard` in design/handoff/bt-ui.jsx (lines 264-280).
 *
 * The handoff rendered it as `<button onClick={() => navigate(to)}>`, so the
 * card that routes visitors into every one of the five services had no href:
 * nothing to middle-click, nothing to open in a new tab, and nothing for a
 * crawler to follow into the catalogue. It is one anchor now — the whole card,
 * one tab stop.
 *
 * The trailing "Discover more →" is `aria-hidden`: it is the same link as the
 * card it sits inside, and announcing it separately would read as a second,
 * unlabelled destination.
 */

import { Icon, Photo, type IconName } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { MediaDto } from '@/lib/content/types'

export type ServiceCardProps = {
  icon: IconName
  title: string
  body: string
  /** Illustration. Null renders the neutral placeholder. */
  image?: MediaDto | null
  /** Locale-agnostic destination, e.g. `/driver`. */
  href: string
  /** Overrides the default "Discover more" affordance. */
  cta: string
  priority?: boolean
}

export function ServiceCard({
  icon,
  title,
  body,
  image = null,
  href,
  cta,
  priority = false,
}: ServiceCardProps) {
  return (
    <Link
      href={href}
      className="card bt-svc-card bt-cardhover"
      style={{ textAlign: 'start', padding: 0, overflow: 'hidden' }}
    >
      {/*
        `div`s rather than `span`s: an anchor's content model is transparent,
        so flow content is legal inside it, but a `span` may only hold phrasing
        content and an `h3` inside one is invalid markup.
      */}
      <div className="bt-card-media" style={{ width: '100%' }}>
        <Photo src={image?.url} alt="" priority={priority} style={{ height: 150 }} />
        <span className="bt-svc-icon">
          <Icon name={icon} size={22} color="#fff" />
        </span>
      </div>

      <div
        style={{
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          flex: 1,
        }}
      >
        <h3 style={{ fontSize: 20 }}>{title}</h3>
        <p className="muted" style={{ fontSize: 14, margin: 0, flex: 1 }}>
          {body}
        </p>
        <span className="bt-svc-more" aria-hidden="true">
          {cta} <Icon name="arrow" size={15} color="var(--orange-deep)" className="flip" />
        </span>
      </div>
    </Link>
  )
}
