'use client'

/**
 * Walks `imageCandidates(src)` on each load error, then reports `failed`.
 *
 * Two things the old per-component `useState(false)` handlers got wrong:
 *
 *  - Errors before hydration were lost. A server-rendered `<img>` starts
 *    loading as soon as the HTML arrives; if it fails before React attaches
 *    `onError` (slow JS, fast 404), the handler never runs and the browser's
 *    broken-image glyph stays forever. `ref` checks `complete && naturalWidth
 *    === 0` on mount, which is exactly "already failed".
 *  - The failure flag was a boolean that never reset, so a recycled element
 *    kept its placeholder for every later `src`. State here is keyed by `src`.
 */

import { useCallback, useMemo, useState } from 'react'

import { imageCandidates } from '@/lib/media/fallback'

export function useImageFallback(src: string | null | undefined) {
  const candidates = useMemo(() => imageCandidates(src), [src])
  const key = candidates[0] ?? ''
  const [state, setState] = useState<{ key: string; index: number }>({ key, index: 0 })
  const index = state.key === key ? state.index : 0
  const current = candidates[index] ?? null

  const onError = useCallback(() => {
    setState((prev) => {
      const at = prev.key === key ? prev.index : 0
      return { key, index: Math.min(at + 1, candidates.length) }
    })
  }, [key, candidates.length])

  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (img !== null && img.complete && img.naturalWidth === 0 && img.currentSrc !== '') {
        onError()
      }
    },
    [onError],
  )

  return {
    /** The URL to render now, or null once every candidate failed. */
    src: current,
    /** True after the first candidate failed: drop srcset sources. */
    degraded: index > 0,
    failed: current === null,
    onError,
    attach,
  }
}
