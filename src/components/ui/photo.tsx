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
import type { CSSProperties, ReactNode } from 'react'

import { mediaIdFromUrl } from '@/lib/free-photos/attribution'
import { isGooglePhotoUrl } from '@/lib/google-places/photo-urls'

import { FreePhotoCredit } from './free-photo-credit'
import { GooglePhotoCredit } from './google-photo-credit'
import { useImageFallback } from './use-image-fallback'

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
  /**
   * What to show when there is no image or every fallback failed. Defaults
   * to the branded `.ph-fallback` surface; place slots pass their category
   * glyph. Rendered inside the same box, so swapping causes no layout shift.
   */
  placeholder?: ReactNode
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
  placeholder,
}: PhotoProps) {
  /**
   * Retry, then smaller ladder rungs, then the placeholder; keyed by `src` so
   * a recycled element recovers when it is handed a new URL, and errors that
   * fired before hydration are caught on mount (see useImageFallback).
   */
  const { src: current, degraded, onError, attach } = useImageFallback(src)

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
  // The fallback keeps the box but not the flat ivory fill, so the branded
  // gradient of `.ph-fallback` shows.
  const fallbackStyle: CSSProperties = { ...composed, background: undefined }

  if (current === null) {
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
        style={fallbackStyle}
        {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}
      >
        {placeholder ?? <BrandMark />}
      </div>
    )
  }

  const photoClass = ['photo', className].filter(Boolean).join(' ')
  // A Google place photo carries its attribution (Places API policy).
  // Free photos (Commons / Openverse / Unsplash) carry theirs (licence terms);
  // it renders nothing for our own uploads.
  const credit = isGooglePhotoUrl(src) ? (
    <GooglePhotoCredit src={src} />
  ) : mediaIdFromUrl(src) ? (
    <FreePhotoCredit src={src} />
  ) : null

  if (hasIntrinsicSize) {
    const image = (
      <Image
        key={current}
        src={current}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={photoClass}
        style={composed}
        onError={onError}
      />
    )
    return credit ? (
      <>
        {image}
        {credit}
      </>
    ) : (
      image
    )
  }

  // No intrinsic size to hand next/image; see the note at the top of the file.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current}
      ref={attach}
      src={current}
      alt={alt}
      {...(sizes ? { sizes } : {})}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      className={photoClass}
      style={composed}
      onError={onError}
    />
  )

  // Once the first URL failed, the srcset candidates are suspect too.
  if (credit && (degraded || (!srcSetAvif && !srcSetWebp))) {
    return (
      <>
        {img}
        {credit}
      </>
    )
  }
  if (degraded || (!srcSetAvif && !srcSetWebp)) return img

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
  const picture = (
    <picture style={{ display: 'contents' }}>
      {srcSetAvif ? (
        <source type="image/avif" srcSet={srcSetAvif} {...(sizes ? { sizes } : {})} />
      ) : null}
      {srcSetWebp ? (
        <source type="image/webp" srcSet={srcSetWebp} {...(sizes ? { sizes } : {})} />
      ) : null}
      {img}
    </picture>
  )
  return credit ? (
    <>
      {picture}
      {credit}
    </>
  ) : (
    picture
  )
}

/** The site's leaf mark, small and translucent: "photo coming", not broken. */
function BrandMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true" style={{ opacity: 0.55 }}>
      <path
        d="M12 2C7 7 5 11 5 14a7 7 0 0 0 14 0c0-3-2-7-7-12Zm0 6v12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
