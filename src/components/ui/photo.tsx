'use client'

/**
 * Photo.
 *
 * Replaces the handoff's `flickr(tags, w, h, lock)` helper and its `<Photo>`
 * wrapper. The prototype synthesised loremflickr URLs from a tag string; real
 * images live in the `media` table and are served from the Spaces CDN, so this
 * component only ever renders a URL it was handed.
 *
 * `next.config.ts` sets `images.unoptimized`, deliberately: sharp on the
 * production box competes with Postgres for memory. So next/image buys us
 * layout-stable intrinsic sizing, lazy loading and the `priority` preload
 * hint — but no resizing. It also *requires* numeric width and height. Callers
 * that know the dimensions (everything read from `media`, which stores width
 * and height as NOT NULL) get next/image; the CSS-sized cases from the handoff
 * — `style={{ height: 190 }}` on a card, a banner stretched to `inset: 0` —
 * get a plain lazy `<img>`, because there is no honest intrinsic size to
 * declare and a wrong one would cause layout shift.
 *
 * 'use client' is required: the error fallback hangs off an onError handler.
 */

import Image from 'next/image'
import { useState, type CSSProperties } from 'react'

export type PhotoProps = {
  /** CDN URL. Nullable, because `heroImageId` is a nullable FK. */
  src?: string | null
  /**
   * Alt text. Content, not chrome — pass the localized `media.alt` value, or
   * an empty string for decorative images.
   */
  alt: string
  /** Intrinsic width in px. Supply with `height` to get next/image. */
  width?: number
  /** Intrinsic height in px. Supply with `width` to get next/image. */
  height?: number
  /** Corner radius in px, or any CSS length. */
  radius?: number | string
  className?: string
  /** Escape hatch; wins over the component's own styles, as in the handoff. */
  style?: CSSProperties
  /** Above-the-fold images only. Preloads and opts out of lazy loading. */
  priority?: boolean
  /**
   * Responsive candidates from `MediaDto`. When present the component emits a
   * `<picture>` so the browser can take AVIF, then WebP, then fall back to
   * `src`. Omit them and it renders exactly as before -- callers that only
   * have a URL string are unaffected.
   */
  srcSetAvif?: string | null
  srcSetWebp?: string | null
  /**
   * The `sizes` attribute: how wide this image will actually be laid out.
   * Without it the browser assumes 100vw and picks the largest rung, which
   * throws away most of the benefit of having a ladder at all.
   */
  sizes?: string
}

export function Photo({
  src,
  alt,
  width,
  height,
  radius,
  className,
  style,
  priority = false,
  srcSetAvif,
  srcSetWebp,
  sizes,
}: PhotoProps) {
  /**
   * Which src failed, rather than a boolean.
   *
   * The handoff kept `const [err, setErr] = useState(false)` and never reset
   * it, so once an image 404'd the component stayed broken for every later
   * src — and React reuses these elements aggressively when a filtered grid
   * re-renders. Comparing against the current src makes recovery automatic.
   */
  const [failedSrc, setFailedSrc] = useState<string | null>(null)

  const hasIntrinsicSize = typeof width === 'number' && typeof height === 'number'

  // Sizing: fill the slot by default (the handoff's `.photo` rule), or honour
  // the declared box when one was given. Either way it is set inline so a
  // fixed-size thumbnail is not stretched back to 100% by `.photo`.
  const sizing: CSSProperties = hasIntrinsicSize
    ? { width, height }
    : { width: '100%', height: '100%' }

  const base: CSSProperties = {
    ...sizing,
    display: 'block',
    objectFit: 'cover',
    background: 'var(--ivory-2)',
  }

  const rounded: CSSProperties = radius != null ? { borderRadius: radius } : {}

  const composed: CSSProperties = { ...base, ...rounded, ...style }

  if (!src || failedSrc === src) {
    /**
     * Neutral placeholder rather than a broken-image glyph.
     *
     * The handoff painted the alt text — falling back to the literal string
     * "Bali" — into the box, which hard-coded English into every locale and
     * leaked descriptive copy into the layout. This renders nothing visible
     * and exposes the alt text to assistive tech instead.
     */
    return (
      <div
        className={['photo', 'ph-fallback', className].filter(Boolean).join(' ')}
        style={composed}
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      />
    )
  }

  const photoClass = ['photo', className].filter(Boolean).join(' ')

  if (hasIntrinsicSize) {
    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={photoClass}
        style={composed}
        onError={() => setFailedSrc(src)}
      />
    )
  }

  // No intrinsic size to hand next/image; see the note at the top of the file.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      {...(sizes ? { sizes } : {})}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={photoClass}
      style={composed}
      onError={() => setFailedSrc(src)}
    />
  )

  if (!srcSetAvif && !srcSetWebp) return img

  /**
   * `<picture>` rather than a bare `srcset`, so AVIF can be offered to the
   * browsers that take it and silently skipped by those that do not. Order is
   * load-bearing: the first `<source>` whose type is supported wins, so AVIF
   * must precede WebP, and `<img>` is the last resort.
   *
   * The wrapper is `display: contents` so it introduces no box of its own --
   * every caller's layout targets the img, and an extra element in the flow
   * would break the absolutely-positioned banner cases.
   */
  return (
    <picture style={{ display: 'contents' }}>
      {srcSetAvif ? <source type="image/avif" srcSet={srcSetAvif} {...(sizes ? { sizes } : {})} /> : null}
      {srcSetWebp ? <source type="image/webp" srcSet={srcSetWebp} {...(sizes ? { sizes } : {})} /> : null}
      {img}
    </picture>
  )
}
