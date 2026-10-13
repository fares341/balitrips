import type { Metadata } from 'next'

import { fontVariables } from '@/styles/fonts'

import { messagesFor } from './_i18n'
import { getAdminI18n } from './_lib/i18n'
import { AdminI18nProvider } from './_ui/i18n-provider'

import './admin.css'
import '@/styles/tokens.css'

/**
 * Admin root layout.
 *
 * This is a SECOND root layout, mounted in the `(admin)` route group so the
 * admin sits entirely outside `[locale]`. It is never locale-prefixed and it
 * is never statically rendered — every page below reads the session cookie
 * and must therefore be dynamic.
 *
 * The Studio UI is Arabic (default, RTL) or English, switched from the
 * sidebar and kept in the `studio_lang` cookie. It has its own small
 * dictionaries in `_i18n/` rather than next-intl: it lives outside
 * `[locale]` and must not add keys to the public messages/*.json. The
 * CONTENT it edits stays fully trilingual (en/ar/id).
 */

/**
 * Never prerender, never cache.
 *
 * Without this, a page that happens not to touch cookies could be
 * statically optimised and served to the next visitor — which for an admin
 * means serving one operator's view to another.
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: { default: 'Studio', template: '%s · Studio' },
  // Belt and braces: the proxy sets X-Robots-Tag on every admin response,
  // which is what actually keeps this out of an index. The path is
  // deliberately NOT in robots.txt — a Disallow line publishes it.
  robots: { index: false, follow: false, nocache: true },
}

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dir } = await getAdminI18n()
  // English underneath: a key missing from one language still shows words.
  const messages = { ...messagesFor('en'), ...messagesFor(locale) }
  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      <body className="a-body">
        <AdminI18nProvider locale={locale} messages={messages}>
          {children}
        </AdminI18nProvider>
      </body>
    </html>
  )
}
