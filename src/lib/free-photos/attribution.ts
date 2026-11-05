/**
 * Attribution for free photos: «Photo: <author> · <licence> · <source>».
 * Pure and client-safe; the credit component and `media.credit` share it.
 */

export type CreditSource = 'commons' | 'openverse' | 'unsplash'

export interface PhotoCredit {
  source: CreditSource
  author: string | null
  authorUrl: string | null
  license: string
  licenseUrl: string | null
  sourceUrl: string | null
}

export const SOURCE_LABEL: Record<CreditSource, string> = {
  commons: 'Wikimedia Commons',
  openverse: 'Openverse',
  unsplash: 'Unsplash',
}

/** Strip HTML (Commons «Artist» is HTML) and collapse whitespace. */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** First http(s) link in an HTML snippet, made absolute. */
export function firstHref(html: string | null | undefined): string | null {
  if (!html) return null
  const m = /href="([^"]+)"/i.exec(html)
  if (!m) return null
  const href = m[1]!.replace(/&amp;/g, '&')
  if (href.startsWith('//')) return `https:${href}`
  if (href.startsWith('/wiki/')) return `https://commons.wikimedia.org${href}`
  return /^https?:\/\//i.test(href) ? href : null
}

/** Unsplash asks for referral parameters on every link back. */
export function unsplashRef(url: string): string {
  const sep = url.includes('?') ? '&' : '?'
  return `${url}${sep}utm_source=balitrips&utm_medium=referral`
}

export function authorName(credit: Pick<PhotoCredit, 'author'>): string {
  const name = (credit.author ?? '').trim()
  return name === '' ? 'Unknown author' : name.slice(0, 120)
}

/** Plain-text credit, stored in `media.credit` too. */
export function creditText(credit: PhotoCredit): string {
  const parts = [`Photo: ${authorName(credit)}`, credit.license, SOURCE_LABEL[credit.source]]
  const line = parts.join(' · ')
  return credit.sourceUrl ? `${line} (${credit.sourceUrl})` : line
}

const MEDIA_ID =
  /\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/|#m=([0-9a-f-]{36})$/i

/** Our media id from a rendered photo URL (CDN rung, or a hotlink tagged `#m=`). */
export function mediaIdFromUrl(src: string | null | undefined): string | null {
  if (!src) return null
  const m = MEDIA_ID.exec(src)
  return (m?.[1] ?? m?.[2] ?? null)?.toLowerCase() ?? null
}
