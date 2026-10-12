/**
 * `/search`.
 *
 * The header's search control is `<Link href={SEARCH_HREF}>` and `SEARCH_HREF`
 * is `/search`, so the overlay needs an address to live at — this file is it.
 * The route exists for three reasons the prototype's state-driven overlay
 * could not offer: a search is linkable (`/search?q=batur`), Back closes it
 * rather than leaving the site, and the control in the header works with
 * JavaScript still loading.
 *
 * The page renders nothing of its own: `.bt-search-scrim` covers the viewport,
 * and the shell's header and footer show through it. `?q=` is read here so the
 * first paint already carries the query instead of flashing an empty box.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { SearchPageOverlay } from '@/components/search'

import { toLocale } from '../_seo-hreflang'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('srch_t'),
    description: t('c_search'),
    // A search results page has nothing of its own to index, and indexing one
    // is how a site ends up competing with itself for its own catalogue.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const query = await searchParams
  const q = typeof query.q === 'string' ? query.q : ''

  return <SearchPageOverlay initialQuery={q} />
}
