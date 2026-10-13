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
 * v3: styled by bt.css `.crumbs` — a flat `nav > (link | separator)*` row
 * with the package's "›" / "‹" separators. The last crumb carries
 * `aria-current="page"`.
 */

import { Fragment } from 'react'

import { useLocale, useTranslations } from 'next-intl'
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
  /** Accessible name for the landmark. Defaults to the translated "Breadcrumb". */
  label?: string
  className?: string
}

export function Breadcrumbs({ trail, light = false, label, className }: BreadcrumbsProps) {
  const t = useTranslations()
  const locale = useLocale()
  if (trail.length === 0) return null
  // The package's separators: "›" reads forward in LTR, "‹" in RTL.
  const sep = locale === 'ar' ? '‹' : '›'

  return (
    <nav
      aria-label={label ?? t('bt_breadcrumb')}
      className={['crumbs', light ? 'on-dark' : null, className].filter(Boolean).join(' ')}
    >
      {trail.map((crumb, index) => {
        const isLast = index === trail.length - 1
        // Labels can repeat across a trail ("Bali › Ubud › Bali Swing"), so
        // index is part of the key rather than the label alone.
        const key = `${index}-${crumb.label}`

        return (
          <Fragment key={key}>
            {isLast || crumb.href === undefined ? (
              <span aria-current={isLast ? 'page' : undefined}>{crumb.label}</span>
            ) : (
              <Link href={crumb.href}>{crumb.label}</Link>
            )}
            {!isLast && (
              <span className="sep" aria-hidden="true">
                {sep}
              </span>
            )}
          </Fragment>
        )
      })}
    </nav>
  )
}
