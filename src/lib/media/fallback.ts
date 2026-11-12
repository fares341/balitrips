/**
 * What to try when a place photo fails to load.
 *
 * Pure (no React, no I/O) so it is unit-tested on its own and safe in the
 * client bundle. `useImageFallback` walks this list on every `error` event and
 * shows a placeholder only once it is exhausted.
 *
 * Order:
 *  1. the URL as given;
 *  2. the same URL once more with a cache-busting query: the common failure is
 *     transient (an origin 502 or a timeout from the 2 vCPU box behind
 *     `/media/*`), and the browser will not re-request a URL that just failed;
 *  3. for a ladder rung (`media/<id>/<w>.<fmt>`): the next smaller WebP rung,
 *     then 320.webp. Smaller rungs always exist when the larger one should --
 *     `rungsFor` only drops rungs ABOVE the source width, and the pipeline
 *     refuses sources under 320px -- so these cover a rung that was requested
 *     but never written (the original 1280 vs 320 mismatch, an AVIF encode
 *     that failed, a source narrower than the requested rung).
 */

import { WIDTH_LADDER } from './ladder'

/** `<anything>/media/<uuid>/<width>.<webp|avif>[?query]` */
const RUNG = /^(.*\/media\/[0-9a-f-]{36}\/)(\d+)\.(webp|avif)(\?.*)?$/i

export const RETRY_PARAM = 'img-retry'

function withRetry(src: string): string {
  if (src.startsWith('data:') || src.startsWith('blob:')) return src
  const hash = src.indexOf('#')
  const head = hash === -1 ? src : src.slice(0, hash)
  const tail = hash === -1 ? '' : src.slice(hash)
  return `${head}${head.includes('?') ? '&' : '?'}${RETRY_PARAM}=1${tail}`
}

export function imageCandidates(src: string | null | undefined): string[] {
  if (typeof src !== 'string') return []
  const trimmed = src.trim()
  if (trimmed === '') return []

  const out: string[] = [trimmed]
  const retry = withRetry(trimmed)
  if (retry !== trimmed) out.push(retry)

  const match = RUNG.exec(trimmed)
  if (match) {
    const base = match[1]!
    const width = Number(match[2])
    const smaller = [...WIDTH_LADDER].filter((rung) => rung < width).pop()
    for (const rung of [smaller, WIDTH_LADDER[0]]) {
      if (rung === undefined) continue
      const url = `${base}${rung}.webp`
      if (!out.includes(url)) out.push(url)
    }
  }
  return out
}

/**
 * A WebP `srcset` for a bare ladder-rung URL (`/media/<id>/1280.webp`), so a
 * caller that only has the URL string still lets a phone take a smaller rung.
 *
 * Capped at the rung in the URL: it never offers anything larger than what
 * was rendered before. Only WebP, and only rungs below the given one -- those
 * always exist when the given one does (see the note above); AVIF may not.
 * Returns null for anything that is not a local WebP rung.
 */
export function rungSrcSet(src: string | null | undefined): string | null {
  if (typeof src !== 'string') return null
  const match = RUNG.exec(src.trim())
  if (!match || match[3]!.toLowerCase() !== 'webp' || match[4]) return null
  const base = match[1]!
  const width = Number(match[2])
  const rungs = [...WIDTH_LADDER].filter((rung) => rung < width)
  if (rungs.length === 0) return null
  return [...rungs, width].map((rung) => `${base}${rung}.webp ${rung}w`).join(', ')
}
