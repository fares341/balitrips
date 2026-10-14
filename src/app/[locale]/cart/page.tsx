/**
 * `/cart` — the old address of My Trip.
 *
 * The v3 design names the page "My Trip" at `/my-trip`. Links in old emails,
 * bookmarks and the in-site notifications still point here, so the route
 * stays as a permanent redirect that keeps the query string.
 */

import { permanentRedirect } from 'next/navigation'

import { getPathname } from '@/i18n/routing'

import { toLocale } from '../_seo-hreflang'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

export default async function CartRedirect({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}): Promise<never> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, item)
    }
  }
  const search = query.toString()
  permanentRedirect(
    `${getPathname({ href: '/my-trip', locale })}${search === '' ? '' : `?${search}`}`,
  )
}
