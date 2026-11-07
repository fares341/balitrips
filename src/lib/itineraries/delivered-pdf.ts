/**
 * Which PDF a buyer receives for one language — one rule for the delivery
 * code (`account/_lib/queries.ts`) and the Studio «ملف PDF» tab, so what the
 * owner is told is what is sent. Pure.
 *
 *  1. a file uploaded in Studio for that language;
 *  2. else the file uploaded for the fallback language (English);
 *  3. else the auto-generated file of the bought version, that language;
 *  4. else the generated file in the fallback language;
 *  5. else nothing yet («not ready»).
 */

import { defaultLocale } from '@/i18n/config'

export type DeliveredPdf =
  | { kind: 'uploaded'; locale: string; objectKey: string }
  | { kind: 'generated'; locale: string; objectKey: string }
  | { kind: 'none' }

export function deliveredPdf(input: {
  locale: string
  uploadedKeys: Partial<Record<string, string>> | null | undefined
  /** Generated files of the version being delivered. */
  generated: readonly { locale: string; objectKey: string }[]
  fallbackLocale?: string
}): DeliveredPdf {
  const fallback = input.fallbackLocale ?? defaultLocale
  const uploaded = input.uploadedKeys ?? {}
  for (const locale of [input.locale, fallback]) {
    const key = uploaded[locale]
    if (typeof key === 'string' && key !== '') return { kind: 'uploaded', locale, objectKey: key }
  }
  for (const locale of [input.locale, fallback]) {
    const doc = input.generated.find((one) => one.locale === locale)
    if (doc) return { kind: 'generated', locale, objectKey: doc.objectKey }
  }
  return { kind: 'none' }
}
