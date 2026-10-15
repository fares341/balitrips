/**
 * A place's own photo, or — when it truly has none — a neutral placeholder
 * (the category glyph on a soft background). Never a stock photo standing in
 * for the place: a visitor would take it for the real thing.
 */

import { Icon, Photo, type IconName } from '@/components/ui'

export function PlaceThumb({
  src,
  icon,
  alt = '',
  className,
  priority = false,
  size = 22,
}: {
  src: string | null | undefined
  icon: IconName
  alt?: string
  className?: string
  priority?: boolean
  /** Glyph size of the placeholder. */
  size?: number
}) {
  if (src) {
    return (
      <span className={className}>
        <Photo src={src} alt={alt} priority={priority} />
      </span>
    )
  }
  return (
    <span
      className={className ? `${className} pl-ph` : 'pl-ph'}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
    >
      <Icon name={icon} size={size} />
    </span>
  )
}
