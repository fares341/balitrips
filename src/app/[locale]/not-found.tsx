/**
 * Locale-aware 404 — v3 screen 28 (design-reference/prototype/404.html).
 *
 * Rendered inside the [locale] layout (header, footer, tab bar) for any
 * `notFound()` in a public page and for unknown paths (`[...rest]`).
 */

import { getTranslations } from 'next-intl/server'

import { LinkButton } from '@/components/bt'

export default async function LocaleNotFound() {
  const t = await getTranslations()

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
      </div>
    </main>
  )
}
