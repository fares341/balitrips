/**
 * The public itinerary page's editable copy (Studio «محتوى الصفحة», migration
 * 0049). Pure.
 *
 * One jsonb document per itinerary. Every text is per language and optional:
 * a blank text means "the site default" (the translation the page always
 * used), so an itinerary nobody touched renders exactly as before. Lists
 * (benefits, how-it-works steps) are null until the owner customises them;
 * null = the default list.
 *
 * Pre-purchase copy only. The cleaner below is an allow-list: it rebuilds
 * the document field by field, so nothing else the client posts survives.
 */

import type { BaliIconName } from '@/components/ui/bali-icon'

export type L10n = Partial<Record<string, string>>

/** Sections of the public page in their default order. */
export const PAGE_SECTION_KEYS = [
  'about',
  'get',
  'gallery',
  'days',
  'fit',
  'how',
  'faq',
  'custom',
  'others',
] as const
export type PageSectionKey = (typeof PAGE_SECTION_KEYS)[number]

/** Icons the owner may choose for a benefit (all BaliIcon names). */
export const BENEFIT_ICONS: readonly BaliIconName[] = [
  'calendar',
  'food',
  'pin',
  'clock',
  'tip',
  'phone',
  'map',
  'family',
  'ticket',
  'shield',
  'bolt',
  'unlock',
  'lock',
  'info',
]

/** Every single text field, with the translation key it falls back to. */
export const PAGE_TEXT_KEYS = {
  heroFrom: 'it_price_from',
  aboutTitle: 'itd_about_t',
  getTitle: 'itd_get_t',
  galleryTitle: 'itp_shots_t',
  daysTitle: 'itd_days_t',
  daysNote: 'itd_days_note',
  fitTitle: 'itd_fit_t',
  howTitle: 'itd_how_t',
  faqTitle: 'itd_faq_t',
  customTitle: 'itd_custom_t',
  customBody: 'itd_custom_b',
  customCta: 'itd_custom_cta',
  boxTitle: 'itp_box_t',
  boxFootnote: 'itp_digital',
  trustPay: 'itd_trust_pay',
  trustFast: 'itd_trust_fast',
  actsLine: 'itp_acts_line',
  othersTitle: 'it4_others',
} as const
export type PageTextKey = keyof typeof PAGE_TEXT_KEYS

/** `label`/`text` (not title/description: the leak test bans those keys). */
export interface PageBenefit {
  icon: BaliIconName
  label: L10n
  text: L10n
}

export interface PageStep {
  label: L10n
  text: L10n
}

export interface PageSection {
  key: PageSectionKey
  hidden: boolean
}

export interface PageContent {
  texts: Partial<Record<PageTextKey, L10n>>
  /** Null = the default benefit list. */
  benefits: PageBenefit[] | null
  /** Null = the default three steps. */
  how: PageStep[] | null
  /** Always every key once, in display order. */
  sections: PageSection[]
}

const MAX_TEXT = 600
const MAX_ROWS = 12

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Localized text with only ar/en/id, trimmed, blanks dropped. */
export function cleanL10n(value: unknown, max = MAX_TEXT): L10n {
  const out: L10n = {}
  if (!isRecord(value)) return out
  for (const locale of ['ar', 'en', 'id']) {
    const text = value[locale]
    if (typeof text === 'string' && text.trim() !== '') out[locale] = text.trim().slice(0, max)
  }
  return out
}

const hasText = (value: L10n) => Object.keys(value).length > 0

function isSectionKey(value: unknown): value is PageSectionKey {
  return typeof value === 'string' && (PAGE_SECTION_KEYS as readonly string[]).includes(value)
}

/** Order + visibility: known keys once each, missing keys appended (shown). */
export function cleanSections(raw: unknown): PageSection[] {
  const out: PageSection[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (!isRecord(entry) || !isSectionKey(entry.key) || seen.has(entry.key)) continue
      seen.add(entry.key)
      out.push({ key: entry.key, hidden: entry.hidden === true })
    }
  }
  for (const key of PAGE_SECTION_KEYS) if (!seen.has(key)) out.push({ key, hidden: false })
  return out
}

function cleanRows<T>(raw: unknown, map: (row: Record<string, unknown>) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null
  const out: T[] = []
  for (const entry of raw.slice(0, MAX_ROWS)) {
    if (!isRecord(entry)) continue
    const row = map(entry)
    if (row !== null) out.push(row)
  }
  return out
}

/** Any stored or posted value → a clean `PageContent`. Never throws. */
export function normalisePageContent(raw: unknown): PageContent {
  const source = isRecord(raw) ? raw : {}
  const texts: Partial<Record<PageTextKey, L10n>> = {}
  const rawTexts = isRecord(source.texts) ? source.texts : {}
  for (const key of Object.keys(PAGE_TEXT_KEYS) as PageTextKey[]) {
    const value = cleanL10n(rawTexts[key])
    if (hasText(value)) texts[key] = value
  }
  const benefits = cleanRows(source.benefits, (row) => {
    const label = cleanL10n(row.label, 120)
    if (!hasText(label)) return null
    const icon = (BENEFIT_ICONS as readonly string[]).includes(row.icon as string)
      ? (row.icon as BaliIconName)
      : 'tip'
    return { icon, label, text: cleanL10n(row.text, 300) }
  })
  const how = cleanRows(source.how, (row) => {
    const label = cleanL10n(row.label, 120)
    if (!hasText(label)) return null
    return { label, text: cleanL10n(row.text, 300) }
  })
  return { texts, benefits, how, sections: cleanSections(source.sections) }
}

/** The text for one key in one language, or null (= use the translation). */
export function pageText(content: PageContent, key: PageTextKey, locale: string): string | null {
  const value = content.texts[key]
  if (!value) return null
  return value[locale] ?? value.ar ?? value.en ?? value.id ?? null
}

/** Pick one language from a localized row, falling back across languages. */
export function pickL10n(value: L10n, locale: string): string {
  return value[locale] ?? value.ar ?? value.en ?? value.id ?? ''
}

/** Visible sections in order. */
export function visibleSections(content: PageContent): PageSectionKey[] {
  return content.sections.filter((section) => !section.hidden).map((section) => section.key)
}
