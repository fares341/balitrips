import Link from 'next/link'

import { defaultLocale, localeConfig } from '@/i18n/config'
import { fontVariables } from '@/styles/fonts'

import '@/styles/tokens.css'
import '@/styles/base.css'

import messages from '../../messages/en.json'

/**
 * Global 404.
 *
 * The prototype had no 404 at all — detail pages silently fell back to the
 * first record (`findActivity(id) || ACTIVITIES[0]`), so every bad URL
 * returned 200 with duplicate content. That is bad for users and actively
 * harmful for SEO.
 *
 * This file sits ABOVE the [locale] segment and renders its own <html>, so
 * it cannot use the request-scoped translation context. It falls back to
 * English deliberately: a locale-aware 404 lives inside [locale], and this
 * one only catches paths that never matched a locale in the first place.
 */
export default function NotFound() {
  const { dir } = localeConfig[defaultLocale]

  return (
    <html lang={defaultLocale} dir={dir} className={fontVariables}>
      <body>
        <main className="wrap" style={{ paddingBlock: 'var(--space-16)', textAlign: 'center' }}>
          <h1 style={{ fontSize: 'clamp(28px, 5vw, 42px)' }}>{messages.nf_title}</h1>
          <p style={{ color: 'var(--muted)', marginBlock: 'var(--space-4)' }}>{messages.nf_body}</p>
          <Link href="/" style={{ color: 'var(--orange-deep)', fontWeight: 700 }}>
            {messages.nf_back}
          </Link>
        </main>
      </body>
    </html>
  )
}
