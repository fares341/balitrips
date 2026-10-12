import type { Metadata } from 'next'

import { fontVariables } from '@/styles/fonts'

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
 * The UI is English-only by design. It is an internal tool for a small
 * operations team, not customer-facing copy, so it does not consume
 * next-intl and does not add keys to messages/{en,ar,id}.json. The CONTENT
 * it edits is fully trilingual; the chrome around it is not.
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

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={fontVariables}>
      <body className="a-body">{children}</body>
    </html>
  )
}
