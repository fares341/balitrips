'use client'

/**
 * A plain `<img>` that never shows the broken-image glyph: it retries and
 * falls back down the ladder (`useImageFallback`), then renders `fallback`.
 * For CSS-sized slots that used a bare `<img>`; the slot's own CSS keeps the
 * box, so swapping img -> fallback causes no layout shift.
 */

import type { ImgHTMLAttributes, ReactNode } from 'react'

import { isGooglePhotoUrl } from '@/lib/google-places/photo-urls'

import { GooglePhotoCredit } from './google-photo-credit'
import { useImageFallback } from './use-image-fallback'

export type SafeImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string | null | undefined
  /** Rendered when there is no src or every candidate failed. */
  fallback?: ReactNode
}

export function SafeImg({ src, fallback = null, alt = '', ...rest }: SafeImgProps) {
  const { src: current, failed, onError, attach } = useImageFallback(src)
  if (failed) return <>{fallback}</>
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={current ?? ''}
      ref={attach}
      src={current ?? undefined}
      alt={alt}
      onError={onError}
      {...rest}
    />
  )
  // A Google place photo carries its attribution (Places API policy).
  if (!isGooglePhotoUrl(src)) return img
  return (
    <>
      {img}
      <GooglePhotoCredit src={src} />
    </>
  )
}
