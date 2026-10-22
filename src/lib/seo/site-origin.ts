/**
 * Public origin used for share metadata (`metadataBase`, og:image, JSON-LD).
 *
 * `NEXT_PUBLIC_SITE_URL` when it names a real host; otherwise production's
 * https://balitrips.co. A build that was given `http://localhost:3000` must
 * never put localhost into an og:image, which is what a link previewer
 * (WhatsApp, X) fetches — it showed no picture at all.
 */
const PRODUCTION_ORIGIN = 'https://balitrips.co'

export const SHARE_ORIGIN: string = (() => {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '')
  if (raw === '' || /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/i.test(raw)) return PRODUCTION_ORIGIN
  return raw
})()

/** Default 1200×630 share image (JPEG: every link previewer reads it). */
export const DEFAULT_SHARE_IMAGE = {
  url: '/og/default.jpg',
  width: 1200,
  height: 630,
  alt: 'Bali Trips',
} as const

export function shareUrl(path: string): string {
  return /^https?:\/\//.test(path)
    ? path
    : `${SHARE_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`
}
