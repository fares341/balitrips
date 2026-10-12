/**
 * Logo.
 *
 * The Bali Trips wordmark, a raster asset copied from
 * design/handoff/assets/bt-logo.png to public/bt-logo.png.
 *
 * It is never recoloured — no `filter: invert()`, no CSS masking, no
 * `currentColor` SVG substitute. The mark carries its own palette and the
 * brand owns it. On dark surfaces the handoff sits it on an ivory plate (see
 * the footer) or leans on `onLight={false}` for a drop shadow, which adds
 * separation without touching a single hue.
 *
 * No 'use client' — it is a static image.
 */

import Image from 'next/image'

/** Intrinsic pixel size of public/bt-logo.png. Fixes the aspect ratio. */
const INTRINSIC_WIDTH = 1202
const INTRINSIC_HEIGHT = 352
const ASPECT = INTRINSIC_WIDTH / INTRINSIC_HEIGHT

export type LogoProps = {
  /** Rendered height in px. Width follows from the asset's aspect ratio. */
  height?: number
  /**
   * True on ivory/white surfaces (the default). False on forest or over a
   * photo, which adds a drop shadow for separation — a shadow, not a recolour.
   */
  onLight?: boolean
  /**
   * Accessible name. Defaults to the brand name, which is a proper noun and
   * reads identically in en/ar/id, so it is not a translation key. Pass a
   * localized string if a locale ever needs one.
   */
  alt?: string
  /** Set on the header instance — it is above the fold on every page. */
  priority?: boolean
  className?: string
}

export function Logo({
  height = 34,
  onLight = true,
  alt = 'Bali Trips',
  priority = false,
  className,
}: LogoProps) {
  const width = Math.round(height * ASPECT)

  return (
    <Image
      src="/bt-logo.png"
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
      style={{
        height,
        // `width: auto` keeps the ratio when `img { max-width: 100% }` from
        // base.css kicks in on a narrow viewport, and stops next/image warning
        // about a single modified dimension.
        width: 'auto',
        display: 'block',
        filter: onLight ? 'none' : 'drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25))',
      }}
    />
  )
}
