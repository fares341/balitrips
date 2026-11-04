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
