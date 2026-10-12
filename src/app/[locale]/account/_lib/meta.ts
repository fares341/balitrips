/**
 * Metadata for the account routes.
 *
 * One helper rather than six near-identical `generateMetadata` bodies, so the
 * `noindex` cannot be forgotten on the seventh. There is no `alternates` block
 * here on purpose: hreflang describes pages a search engine can fetch, and
 * these are behind a session.
 */

import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import type { Locale } from '@/i18n/config'

export async function accountMetadata(locale: Locale, titleKey: string): Promise<Metadata> {
  const t = await getTranslations({ locale })

  return {
    title: t(titleKey),
    description: t('acct_title'),
    // Somebody's invoices are the last thing that should be in an index.
    robots: { index: false, follow: false },
  }
}
