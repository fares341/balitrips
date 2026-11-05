/**
 * A place's own photo, or — when it has none, its photo is a placeholder
 * shared by many places, or every fallback URL failed — its category glyph
 * on the category colour. Never a stock photo standing in for the place: a
 * visitor would take it for the real thing.
 */

import { Photo } from '@/components/ui'

import { CategoryGlyph } from './category-glyph'

export function PlaceThumb({
  src,
  categoryKey,
  alt = '',
  className,
  priority = false,
  size = 22,
}: {
  src: string | null | undefined
  categoryKey: string | null | undefined
  alt?: string
  className?: string
  priority?: boolean
  /** Glyph size of the placeholder. */
  size?: number
}) {
  if (src) {
    return (
      <span className={className}>
        <Photo
          src={src}
          alt={alt}
          priority={priority}
          placeholder={<CategoryGlyph categoryKey={categoryKey} size={size} />}
        />
      </span>
    )
  }
  return (
    <CategoryGlyph
      className={className ? `${className} pl-ph` : 'pl-ph'}
      categoryKey={categoryKey}
      size={size}
      label={alt || undefined}
    />
  )
}
