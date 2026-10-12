/**
 * Breadcrumbs.
 *
 * Ported from `Breadcrumbs` in design/handoff/bt-ui.jsx.
 *
 * The handoff rendered every crumb as a `<button>` calling `navigate()`, so no
 * crumb was a link: no middle-click, no open-in-new-tab, no href for Google to
 * follow, and no BreadcrumbList in the SERP. Crumbs with a `href` are real
 * anchors here, routed through next-intl's `Link` so they keep the locale
 * prefix.
 *
 * The flat `nav > (link | separator)*` shape is deliberate. `.bt-crumbs` is a
 * flex container that styles its children directly; wrapping the trail in
 * `<ol><li>` — semantically nicer — would collapse the row into a single flex
 * item, and the fix belongs in components.css, which this agent does not own.
 * The last crumb carries `aria-current="page"` either way.
 */

import { Fragment } from 'react'

import { Icon } from '@/components/ui'
import { Link } from '@/i18n/routing'

export type Crumb = {
  /** Already-translated label. Callers hold the `t` function. */
  label: string
  /** Internal path. Omit for a crumb with no destination (the current page). */
  href?: string
}

export type BreadcrumbsProps = {
  trail: Crumb[]
  /** Light treatment for use inside a photo banner. */
  light?: boolean
  /**
   * Accessible name for the landmark. There is no message key for
   * "Breadcrumb" in messages/*.json; pass a translated string when one exists.
   */
  label?: string
  className?: string
}

export function Breadcrumbs({ trail, light = false, label, className }: BreadcrumbsProps) {
  if (trail.length === 0) return null

  return (
    <nav
      aria-label={label ?? 'Breadcrumb'}
      className={['bt-crumbs', light ? 'light' : null, className].filter(Boolean).join(' ')}
    >
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1
        // Labels can repeat across a trail ("Bali › Ubud › Bali Swing"), so
        // index is part of the key rather than the label alone.
        const key = `${index}-${crumb.label}`

        return (
          <Fragment key={key}>
            {isLast || crumb.href === undefined ? (
              <span
                className={isLast ? 'bt-crumb-cur' : 'bt-crumb-link'}
                aria-current={isLast ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            ) : (
              <Link href={crumb.href} className="bt-crumb-link">
                {crumb.label}
              </Link>
            )}

            {!isLast && (
              <span aria-hidden="true" style={{ display: 'inline-flex' }}>
                {/* "flip" mirrors the chevron under dir="rtl". */}
                <Icon name="chevronr" size={13} className="flip" />
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
