/**
 * A fixed brand photo (public/brand, public/map) with a responsive
 * AVIF/WebP srcset built from the committed variants in public/brand/r/
 * (scripts/brand-variants.mjs). Server Component: no client JS.
 *
 * A source that has no variants falls back to a plain <img>.
 */

import { BRAND_SOURCES, BRAND_WIDTHS } from './brand-img-widths'

export type BrandImgProps = {
  src: string
  alt: string
  /** The `sizes` attribute: how wide the image is drawn. Required, so phones get small files. */
  sizes: string
  width?: number
  height?: number
  /** Default lazy: almost every brand photo is below the fold. */
  loading?: 'lazy' | 'eager'
  className?: string
}

const HAS_VARIANTS = new Set<string>(BRAND_SOURCES)

function variantSet(src: string, ext: 'avif' | 'webp'): string {
  const name = src.split('/').pop()!.replace(/\.[a-z0-9]+$/i, '')
  return BRAND_WIDTHS.map((w) => `/brand/r/${name}-${w}.${ext} ${w}w`).join(', ')
}

export function BrandImg({
  src,
  alt,
  sizes,
  width,
  height,
  loading = 'lazy',
  className,
}: BrandImgProps) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- pre-generated variants; runtime optimisation is off
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      decoding="async"
      className={className}
      {...(HAS_VARIANTS.has(src) ? { srcSet: variantSet(src, 'webp'), sizes } : {})}
    />
  )
  if (!HAS_VARIANTS.has(src)) return img
  return (
    <picture>
      <source type="image/avif" srcSet={variantSet(src, 'avif')} sizes={sizes} />
      {img}
    </picture>
  )
}
