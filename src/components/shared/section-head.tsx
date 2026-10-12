/**
 * Section header — eyebrow rule, title, lede, optional trailing action.
 *
 * Ported from `Head` in design/handoff/sections-bt/primitives.jsx.
 *
 * Two changes from the handoff:
 *
 *  1. **Takes content, not message keys.** The handoff's `Head` received the
 *     `t` function plus three key strings and called `t(key)` itself, which
 *     made every heading un-typecheckable and blocked interpolation. Callers
 *     already hold `useTranslations()`; they pass the rendered strings.
 *  2. **`.reveal` is opt-in.** The handoff always attached it. `.reveal` sets
 *     `opacity: 0` and relies on an IntersectionObserver to add `.in` — so any
 *     section rendered without that observer running is permanently invisible.
 *     Default is off; pass `reveal` only where the observer is wired up.
 *
 * The trailing action ("See all →") is laid out with flexbox and no physical
 * direction, so it sits on the right in English and the left in Arabic.
 */

import type { ReactNode } from 'react'

export type SectionHeadProps = {
  /** Small kicker above the title, preceded by the orange rule. */
  eyebrow?: ReactNode
  title: ReactNode
  /** Supporting paragraph below the title. */
  subtitle?: ReactNode
  /** Centre the block. Mutually exclusive with `action` in practice. */
  centered?: boolean
  /** Trailing control, typically a "see all" LinkButton. */
  action?: ReactNode
  /** Heading level. Pick the one the document outline needs, not the size. */
  as?: 'h1' | 'h2' | 'h3'
  /** Attach `.reveal` for scroll-in animation. Requires the observer. */
  reveal?: boolean
  /** Id for the heading, so a section can be `aria-labelledby` it. */
  id?: string
  className?: string
}

export function SectionHead({
  eyebrow,
  title,
  subtitle,
  centered = false,
  action,
  as: Heading = 'h2',
  reveal = false,
  id,
  className,
}: SectionHeadProps) {
  const head = (
    <div
      className={['section-head', centered ? 'center' : null, reveal ? 'reveal' : null, className]
        .filter(Boolean)
        .join(' ')}
    >
      {eyebrow !== undefined && eyebrow !== null && (
        <div className="eyebrow" style={centered ? { justifyContent: 'center' } : undefined}>
          <span
            aria-hidden="true"
            style={{ width: 18, height: 2, background: 'var(--orange)', borderRadius: 2 }}
          />
          {eyebrow}
        </div>
      )}

      <Heading id={id} className="section-title" style={{ marginTop: 14 }}>
        {title}
      </Heading>

      {subtitle !== undefined && subtitle !== null && (
        <p className="lede" style={{ marginTop: 16 }}>
          {subtitle}
        </p>
      )}
    </div>
  )

  if (!action) return head

  // `.bt-sec-head` is the flex row for this case, and it zeroes the inner
  // block's bottom margin. Flexbox needs no direction handling — the row
  // reverses itself under dir="rtl".
  return (
    <div className="bt-sec-head">
      {head}
      {action}
    </div>
  )
}
