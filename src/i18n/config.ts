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

export const defaultLocale: Locale = 'en'

export const localeConfig: Record<Locale, { label: string; short: string; dir: 'ltr' | 'rtl' }> = {
  en: { label: 'English', short: 'EN', dir: 'ltr' },
  ar: { label: 'العربية', short: 'ع', dir: 'rtl' },
  id: { label: 'Indonesia', short: 'ID', dir: 'ltr' },
}

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value)
}
