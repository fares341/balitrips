/**
 * Locale configuration.
 *
 * Arabic is a first-class language with full RTL, not an afterthought — the
 * design mirrors completely. `dir` is consumed by the root layout and must
 * stay the single source of truth; no component should branch on
 * `locale === 'ar'` directly.
 */

export const locales = ['en', 'ar', 'id'] as const

export type Locale = (typeof locales)[number]

/**
 * The site's main language: where the bare domain and any path without a
 * locale prefix land (src/proxy.ts), and what hreflang `x-default` names.
 * Arabic — the owner's main market (H20; site audit, Nov 2026).
 */
export const defaultLocale: Locale = 'ar'

/**
 * The language content falls back to when a translation is missing (stored
 * text is authored in English first), and the language assumed for a record
 * that carries no valid locale (an old account, a malformed request). Not a
 * routing concept: never use it to build a URL.
 */
export const fallbackLocale: Locale = 'en'

export const localeConfig: Record<Locale, { label: string; short: string; dir: 'ltr' | 'rtl' }> = {
  en: { label: 'English', short: 'EN', dir: 'ltr' },
  ar: { label: 'العربية', short: 'ع', dir: 'rtl' },
  id: { label: 'Bahasa Indonesia', short: 'ID', dir: 'ltr' },
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}
