/**
 * What the PUBLIC itinerary pages may know (itineraries phase 2, corrected
 * spec §2.3) — the shapes and the pure mappers. Pure.
 *
 * The rule: nothing of the plan's content leaves the server before purchase.
 * These DTOs are an allow-list, built field by field — never a spread of a
 * row — so a column added later cannot leak by accident. They carry no day
 * titles or descriptions, no activities, no place names, no
 * `linkedPlaceIds`, no PDF keys or links, no internal notes. A day is its
 * number, its teaser image and its «طابع اليوم» only. Image alt text comes
 * from the generic caption typed in Studio (or the itinerary's name), never
 * from the media library, whose alt text may name a place.
 */

import { isIconName, type IconName } from '@/components/ui/icon'
import type { LocalizedText } from '@/lib/content/localize'

import { nightsLabel } from './areas'
import type { PageContent } from './page-content'

/** The audiences the list filters on (spec §0: fixed to these three). */
export const AUDIENCE_KEYS = ['youth', 'couples', 'family'] as const
export type AudienceKey = (typeof AUDIENCE_KEYS)[number]

export function isAudienceKey(value: unknown): value is AudienceKey {
  return typeof value === 'string' && (AUDIENCE_KEYS as readonly string[]).includes(value)
}

/** An image as the public page may use it: the address and sizes, nothing else. */
export interface PublicImage {
  url: string
  width: number
  height: number
  srcSetAvif: string | null
  srcSetWebp: string | null
  /** Generic caption («غروب على البحر»), or null. Never the media's own alt. */
  caption: Partial<Record<string, string>> | null
}

export interface PublicStat {
  icon: IconName
  value: string
  label: Partial<Record<string, string>>
}

export interface PublicTeaserDay {
  dayNumber: number
  image: PublicImage | null
  mood: Partial<Record<string, string>> | null
}

export interface PublicItinerarySummary {
  id: string
  slug: string
  href: string
  name: LocalizedText
  blurb: LocalizedText | null
  days: number
  audience: LocalizedText[]
  audienceKeys: AudienceKey[]
  tripType: LocalizedText | null
  priceMinor: number
  currency: string
  tierPrices: Partial<Record<'economy' | 'mid' | 'luxury', number>>
  includesMap: boolean
  isPopular: boolean
  hero: PublicImage | null
  stats: PublicStat[]
  /**
   * The areas the trip covers, in order (migration 0056) — region names
   * only, resolved on the server. `nights` is null unless the itinerary
   * shows nights («إظهار عدد الليالي»).
   */
  areas: PublicArea[]
}

export interface PublicArea {
  key: string
  name: Partial<Record<string, string>>
  nights: number | null
}

export interface PublicItineraryDetail extends PublicItinerarySummary {
  /** The intro: the long public description typed in Studio. */
  intro: LocalizedText | null
  gallery: PublicImage[]
  /** The first `teaserDaysVisible` days. */
  teaserDays: PublicTeaserDay[]
  /** «+X أيام» after the teaser. */
  moreDays: number
  seoTitle: Partial<Record<string, string>> | null
  seoDescription: Partial<Record<string, string>> | null
  /** «أسئلة شائعة عن هذا الجدول» from Studio; empty = the generic questions. */
  faq: PublicFaq[]
  /** Studio «محتوى الصفحة» (0049): texts, lists, section order. Copy only. */
  page: PageContent
}

export interface PublicFaq {
  q: Partial<Record<string, string>>
  a: Partial<Record<string, string>>
}

/** Studio's per-itinerary FAQ: visible rows with a question, at most 20. */
export function toPublicFaq(raw: unknown): PublicFaq[] {
  if (!Array.isArray(raw)) return []
  const out: PublicFaq[] = []
  for (const entry of raw) {
    if (entry === null || typeof entry !== 'object') continue
    const row = entry as Record<string, unknown>
    if (row.hidden === true) continue
    const q = cleanLocalized(row.q)
    const a = cleanLocalized(row.a)
    if (q === null || a === null) continue
    out.push({ q, a })
    if (out.length === 20) break
  }
  return out
}

/** A media row as the loader reads it. */
export interface MediaLike {
  id: string
  url: string
  width: number
  height: number
  srcSetAvif: string | null
  srcSetWebp: string | null
}

export function toPublicImage(
  media: MediaLike | null | undefined,
  caption: Partial<Record<string, string>> | null = null,
): PublicImage | null {
  if (!media) return null
  return {
    url: media.url,
    width: media.width,
    height: media.height,
    srcSetAvif: media.srcSetAvif,
    srcSetWebp: media.srcSetWebp,
    caption: cleanLocalized(caption),
  }
}

/** A localized jsonb value with blank entries dropped; null when empty. */
export function cleanLocalized(value: unknown): Partial<Record<string, string>> | null {
  if (value === null || typeof value !== 'object') return null
  const out: Partial<Record<string, string>> = {}
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === 'string' && text.trim() !== '') out[key] = text.trim()
  }
  return Object.keys(out).length > 0 ? out : null
}

/** Studio's «وش بتحصل عليه» numbers; malformed entries are dropped. */
export function toPublicStats(raw: unknown): PublicStat[] {
  if (!Array.isArray(raw)) return []
  const out: PublicStat[] = []
  for (const entry of raw.slice(0, 8)) {
    if (entry === null || typeof entry !== 'object') continue
    const { icon, value, label } = entry as Record<string, unknown>
    if (typeof value !== 'string' || value.trim() === '') continue
    out.push({
      icon: typeof icon === 'string' && isIconName(icon) ? icon : 'check',
      value: value.trim().slice(0, 24),
      label: cleanLocalized(label) ?? {},
    })
  }
  return out
}

/** Audience words (any locale) to the three filter keys. */
const AUDIENCE_PATTERNS: readonly [RegExp, AudienceKey][] = [
  [/شباب|youth|young|anak muda|pemuda/i, 'youth'],
  [/عرسان|شهر\s*(?:ال)?عسل|أزواج|الأزواج|couple|honeymoon|pasangan|bulan madu/i, 'couples'],
  [/عائل|عوائل|famil|keluarga/i, 'family'],
]

/** Which of youth / couples / family an itinerary is for, from its audience labels. */
export function audienceKeysOf(
  audience: readonly Partial<Record<string, string>>[],
  name: Partial<Record<string, string>> | null = null,
): AudienceKey[] {
  const texts = audience.flatMap((entry) => Object.values(entry))
  // Owners often wrote the audiences inside the name «(شباب - عوائل)».
  const inName = /[(（]([^()（）]*)[)）]\s*$/.exec(name?.ar ?? '')?.[1]
  if (inName) texts.push(inName)
  const out: AudienceKey[] = []
  for (const [re, key] of AUDIENCE_PATTERNS) {
    if (texts.some((text) => typeof text === 'string' && re.test(text)) && !out.includes(key)) {
      out.push(key)
    }
  }
  return out
}

/** Clamp the teaser count: 0 – all days. */
export function teaserSplit<T>(days: readonly T[], visible: number): { shown: T[]; more: number } {
  const n = Math.max(0, Math.min(days.length, Math.floor(Number.isFinite(visible) ? visible : 3)))
  return { shown: days.slice(0, n), more: days.length - n }
}

/** Every key a public DTO may carry — the test checks the JSON against it. */
export const PUBLIC_DETAIL_KEYS = [
  'id',
  'slug',
  'href',
  'name',
  'blurb',
  'days',
  'audience',
  'audienceKeys',
  'tripType',
  'priceMinor',
  'currency',
  'tierPrices',
  'includesMap',
  'isPopular',
  'hero',
  'stats',
  'areas',
  'intro',
  'gallery',
  'teaserDays',
  'moreDays',
  'seoTitle',
  'seoDescription',
  'faq',
  'page',
] as const

/** «سمينياك · أوبود · أولواتو» (nights only when the DTO carries them); '' = none. */
export function publicAreasLine(areas: readonly PublicArea[], locale: string): string {
  return areas
    .map((area) => {
      const name = area.name[locale] ?? area.name.en ?? area.key
      return area.nights === null ? name : `${name} ${nightsLabel(area.nights, locale)}`
    })
    .join(' · ')
}
