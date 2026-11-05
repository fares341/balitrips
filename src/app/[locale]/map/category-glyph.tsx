/**
 * The category's own map glyph (the same line icon as its pin, e.g. the
 * mosque dome) in white on the category colour: the deliberate stand-in for
 * a place with no unique photo — never a blank box or a borrowed picture.
 */

import type { CSSProperties } from 'react'

import { pinLookFor } from '@/lib/map/pins'

export function CategoryGlyph({
  categoryKey,
  color,
  size = 22,
  className,
  label,
}: {
  categoryKey: string | null | undefined
  /** Overrides the pin colour (e.g. the owner's category colour). */
  color?: string | null
  size?: number
  className?: string
  /** Accessible name; decorative when omitted. */
  label?: string
}) {
  const look = pinLookFor(categoryKey)
  return (
    <span
      className={['cat-glyph', className].filter(Boolean).join(' ')}
      data-testid="place-ph"
      data-category={categoryKey ?? ''}
      style={{ '--c': color || look.color } as CSSProperties}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <path
          d={look.path}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}
