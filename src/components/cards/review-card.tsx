/**
 * ReviewCard.
 *
 * Ported from the card inside `ReviewsBlock` in design/handoff/bt-ui.jsx
 * (lines 328-338).
 *
 * Two corrections:
 *
 *  1. **Proportional stars.** The handoff drew `"★".repeat(r.stars)` as bare
 *     text with no accessible name, so a screen reader heard a run of star
 *     characters. `<Rating>` renders the same five-glyph run with a single
 *     label.
 *  2. **The initial is not sliced from the name.** `r.name[0]` returns the
 *     first UTF-16 code unit, which splits an emoji or a surrogate pair and
 *     renders a replacement character. `Intl.Segmenter` takes the first
 *     grapheme, and the avatar is hidden from assistive tech because the full
 *     name is right beside it.
 */

import { useFormatter, useLocale } from 'next-intl'

import { Rating } from '@/components/shared'
import type { Locale } from '@/i18n/config'
import { pickOptional } from '@/lib/content/localize'
import type { ReviewDto } from '@/lib/content/types'

/** Fixed width in the horizontal scroller, as in the handoff. */
const CARD_WIDTH = 'min(84vw, 340px)'

function firstGrapheme(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return '?'
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  const first = segmenter.segment(trimmed)[Symbol.iterator]().next()
  return first.done === true ? '?' : first.value.segment.toUpperCase()
}

export type ReviewCardProps = {
  review: ReviewDto
  /** Stretch to the container instead of the carousel's fixed width. */
  fluid?: boolean
}

export function ReviewCard({ review, fluid = false }: ReviewCardProps) {
  const locale = useLocale() as Locale
  const format = useFormatter()

  const body = pickOptional(review.body, locale)
  const country = pickOptional(review.authorCountry, locale)

  return (
    <article
      className="card card-pad"
      style={{
        width: fluid ? '100%' : CARD_WIDTH,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <Rating value={review.stars} showValue={false} size="lg" />

      {body !== null && (
        <p style={{ fontSize: 15.5, lineHeight: 1.6, margin: 0, fontWeight: 500, flex: 1 }}>
          {body}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span aria-hidden="true" className="bt-avatar" style={{ width: 38, height: 38 }}>
          {firstGrapheme(review.authorName)}
        </span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{review.authorName}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {country ?? format.dateTime(new Date(review.createdAt), { dateStyle: 'medium' })}
          </div>
        </div>
      </div>
    </article>
  )
}
