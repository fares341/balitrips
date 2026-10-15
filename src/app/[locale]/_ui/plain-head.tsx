/**
 * PlainHead — the v3 package's light page heading (contact, faq, help,
 * policies, search, my trip…): breadcrumbs, a large forest title and a lede,
 * on the ivory page with no photo banner.
 */

import type { ReactNode } from 'react'

import { Breadcrumbs, type Crumb } from '@/components/shared'

export type PlainHeadProps = {
  title: string
  lede?: string | null
  trail: Crumb[]
  breadcrumbLabel?: string
  /** Extra content under the lede (a search box, a tag…). */
  children?: ReactNode
}

export function PlainHead({
  title,
  lede = null,
  trail,
  breadcrumbLabel,
  children,
}: PlainHeadProps) {
  return (
    <section className="plain-head">
      <div className="wrap stack">
        <Breadcrumbs trail={trail} label={breadcrumbLabel} />
        <h1 className="h1">{title}</h1>
        {lede !== null && <p className="lede muted">{lede}</p>}
        {children}
      </div>
    </section>
  )
}
