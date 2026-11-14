/**
 * Locale-aware 404 — v3 screen 28 (design-reference/prototype/404.html).
 *
 * Rendered inside the [locale] layout (header, footer, tab bar) for any
 * `notFound()` in a public page and for unknown paths (`[...rest]`).
 * Unknown paths and missing public records are answered by the proxy with
 * this same UI as a server-rendered page and a 404 status (see
 * ./not-found-page and src/proxy.ts).
 */

import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'

import { LinkButton } from '@/components/bt'
import { hiddenHrefs } from '@/lib/content/public-sections'
import { loadPublicSections } from '@/lib/content/public-sections-server'

import { PopularLinks } from './_ui/popular-links'

/**
 * The 404's own <head>: Next uses this boundary's metadata for a not-found
 * response, including the bare shell it sends when `notFound()` is thrown
 * while a dynamic page renders. The locale comes from the request (the proxy
 * sets it for every prefixed path); there are no route params here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations()
  return {
    title: t('nf5_meta'),
    description: t('nf4_body'),
    robots: { index: false, follow: true },
  }
}

export default async function LocaleNotFound() {
  const [t, sections] = await Promise.all([getTranslations(), loadPublicSections()])

  return (
    <main className="nf">
      <div className="arc" aria-hidden="true" />
      <div className="stack nf-in">
        <div className="nf-num" aria-hidden="true" dir="ltr">
          4<span>0</span>4
        </div>
        <h1 className="h2">{t('nf4_title')}</h1>
        <p className="muted">{t('nf4_body')}</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <LinkButton href="/">{t('nf4_home')}</LinkButton>
          <LinkButton href="/map" variant="ghost">
            {t('nf4_map')}
          </LinkButton>
          <LinkButton href="/search" variant="ghost">
            {t('nf4_search')}
          </LinkButton>
        </div>
        <PopularLinks headingId="nf-pop-h" hidden={hiddenHrefs(sections)} />
      </div>
    </main>
  )
}
