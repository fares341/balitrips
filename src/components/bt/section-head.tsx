/**
 * SectionHead — bt.css `.sec-head`: an eyebrow (orange rule + short label),
 * the section title, an optional lede, and an optional trailing action
 * ("See all") that sits at the end of the row on wide screens and wraps under
 * the text on phones.
 *
 * No 'use client'.
 */

import type { ReactNode } from 'react'

export type SectionHeadProps = {
  /** Short label above the title, drawn with the orange rule before it. */
  eyebrow?: ReactNode
  title: ReactNode
  /** Supporting paragraph under the title (`.lede`). */
  lede?: ReactNode
  /** Trailing control, typically a ghost LinkButton "See all". */
  action?: ReactNode
  /** Heading level for the document outline. Defaults to h2. */
  as?: 'h1' | 'h2' | 'h3'
  /** Id on the heading so the section can be `aria-labelledby` it. */
  id?: string
  /** Centre the block (no action). */
  center?: boolean
  /** Title size: `h2` (default, --t-h2) or `h1` (--t-h1). */
  size?: 'h1' | 'h2' | 'h3'
  className?: string
}

export function SectionHead({
  eyebrow,
  title,
  lede,
  action,
  as: Heading = 'h2',
  id,
  center = false,
  size = 'h2',
  className,
}: SectionHeadProps) {
  return (
    <div
      className={['sec-head', className].filter(Boolean).join(' ')}
      style={center ? { justifyContent: 'center', textAlign: 'center' } : undefined}
    >
      <div style={center ? { alignItems: 'center' } : undefined}>
        {eyebrow !== undefined && eyebrow !== null && <span className="eyebrow">{eyebrow}</span>}
        <Heading id={id} className={size}>
          {title}
        </Heading>
        {lede !== undefined && lede !== null && <p className="lede">{lede}</p>}
      </div>
      {action}
    </div>
  )
}
