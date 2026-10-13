/** Studio UI languages. The CONTENT it edits stays trilingual (en/ar/id). */
export const ADMIN_LOCALES = ['ar', 'en'] as const
export type AdminLocale = (typeof ADMIN_LOCALES)[number]
/**
 * With no cookie the Studio renders English — that is also what an anonymous
 * probe of the admin path gets, so the 404 there looks like before. Staff get
 * Arabic as their starting language: `/api/admin-link` sets the cookie to
 * INITIAL_ADMIN_LOCALE the first time it answers for an elevated session.
 */
export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'en'
export const INITIAL_ADMIN_LOCALE: AdminLocale = 'ar'
export const ADMIN_LOCALE_COOKIE = 'studio_lang'

export type Messages = Record<string, string>

/**
 * One dictionary file per area of the Studio. Keys are namespaced by area
 * (`orders.refund_btn`) so files never collide when merged.
 */
export interface Section {
  en: Messages
  ar: Messages
}

export function isAdminLocale(value: unknown): value is AdminLocale {
  return value === 'ar' || value === 'en'
}

/** Intl locale for dates and numbers: Arabic text with Latin digits. */
export function intlLocale(locale: AdminLocale): string {
  return locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
}

export type Vars = Record<string, string | number | bigint | null | undefined>

/** `{name}` placeholders. A missing key falls back to English, then to the key. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name]
    return value === undefined || value === null ? match : String(value)
  })
}
