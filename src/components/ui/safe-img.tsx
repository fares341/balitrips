'use client'

/**
 * A plain `<img>` that never shows the broken-image glyph: it retries and
 * falls back down the ladder (`useImageFallback`), then renders `fallback`.
 * For CSS-sized slots that used a bare `<img>`; the slot's own CSS keeps the
 * box, so swapping img -> fallback causes no layout shift.
 */

import { useCallback, type ImgHTMLAttributes, type ReactNode } from 'react'

import { isGooglePhotoUrl } from '@/lib/google-places/photo-urls'

import { GooglePhotoCredit } from './google-photo-credit'
import { useImageFallback } from './use-image-fallback'
import { useNearViewport } from './use-near-viewport'

export type SafeImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> & {
  src: string | null | undefined
  /** Rendered when there is no src or every candidate failed. */
  fallback?: ReactNode
  /**
   * Load a Google photo only once the slot is in or near the viewport
   * (map carousel cards: each load is a billable request). Our own photos
   * load as before.
   */
  deferGoogle?: boolean
}

export function SafeImg({
  src,
  fallback = null,
  alt = '',
  deferGoogle = false,
  ...rest
}: SafeImgProps) {
  const { src: current, failed, onError, attach } = useImageFallback(src)
  const google = isGooglePhotoUrl(src)
  const { visible, observe } = useNearViewport(deferGoogle && google)
  const ref = useCallback(
    (el: HTMLImageElement | null) => {
      observe(el)
      if (visible) attach(el)
    },
    [observe, attach, visible],
  )
  if (failed) return <>{fallback}</>
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={visible ? (current ?? '') : 'deferred'}
      ref={ref}
      src={visible ? (current ?? undefined) : undefined}
      alt={alt}
      onError={onError}
      {...rest}
    />
  )
  // A Google place photo carries its attribution (Places API policy).
  if (!google) return img
  return (
    <>
      {img}
      {visible ? <GooglePhotoCredit src={src} compact={deferGoogle} /> : null}
    </>
  )
}
