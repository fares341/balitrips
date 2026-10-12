/**
 * Star rating, display only.
 *
 * Ported from `Rating` in design/handoff/bt-ui.jsx and the five-glyph run in
 * its `ReviewsBlock`. The handoff had both: a single star beside a number for
 * cards, and `"★".repeat(r.stars)` for reviews. This renders the five-star run
 * in every case and fills it proportionally, so 4.6 and 4.9 no longer look
 * identical.
 *
 * Not interactive. If a review form ever needs input, that is a different
 * component with radio semantics — do not add an onChange here.
 *
 * The number goes through `useFormatter`, so Arabic gets Arabic-Indic digits
 * and a decimal comma where the locale calls for one. The handoff interpolated
 * the raw JS number into every language.
 */

import { useFormatter, useTranslations } from 'next-intl'
import type { CSSProperties } from 'react'

export type RatingSize = 'sm' | 'md' | 'lg'

/** The scale. Fixed at five — the data model has no other maximum. */
const STARS = 5

const SIZE: Record<RatingSize, { star: number; text: number }> = {
  sm: { star: 12, text: 12 },
  md: { star: 14, text: 13 },
  lg: { star: 18, text: 16 },
}

export type RatingProps = {
  /** Mean score on a 0–5 scale. Clamped, so bad data cannot overflow the bar. */
  value: number
  /** Show the numeric score next to the stars. */
  showValue?: boolean
  size?: RatingSize
  /** Review count, rendered in parentheses. Omit when unknown. */
  count?: number
  /** Light treatment for use over photography. */
  light?: boolean
  className?: string
}

export function Rating({
  value,
  showValue = true,
  size = 'md',
  count,
  light = false,
  className,
}: RatingProps) {
  const t = useTranslations()
  const format = useFormatter()

  const metrics = SIZE[size]
  const clamped = Math.min(STARS, Math.max(0, value))
  const filledPercent = (clamped / STARS) * 100

  const scoreText = format.number(clamped, { maximumFractionDigits: 1 })
  const countText = count === undefined ? null : format.number(count)

  // One accessible name for the whole control. The visual parts are hidden
  // from assistive tech so the score is not read twice.
  const accessibleName =
    countText === null ? scoreText : `${scoreText} — ${countText} ${t('c_reviews')}`

  const glyphs = '★'.repeat(STARS)

  const trackStyle: CSSProperties = {
    color: light ? 'rgba(255,255,255,0.4)' : 'var(--line)',
    fontSize: metrics.star,
    lineHeight: 1,
  }

  const fillStyle: CSSProperties = {
    position: 'absolute',
    insetInlineStart: 0,
    top: 0,
    width: `${filledPercent}%`,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    color: 'var(--orange)',
    fontSize: metrics.star,
    lineHeight: 1,
  }

  return (
    <span
      role="img"
      aria-label={accessibleName}
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: metrics.text,
        fontWeight: 700,
        color: light ? '#fff' : 'var(--forest)',
      }}
    >
      <span aria-hidden="true" style={{ position: 'relative', display: 'inline-block' }}>
        <span className="stars" style={trackStyle}>
          {glyphs}
        </span>
        <span className="stars" style={fillStyle}>
          {glyphs}
        </span>
      </span>

      {showValue && <span aria-hidden="true">{scoreText}</span>}

      {countText !== null && (
        <span
          aria-hidden="true"
          className={light ? undefined : 'muted'}
          style={{ fontWeight: 500, color: light ? 'rgba(255,255,255,.75)' : undefined }}
        >
          ({countText})
        </span>
      )}
    </span>
  )
}
