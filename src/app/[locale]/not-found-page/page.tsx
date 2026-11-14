/**
 * The not-found page as a real page.
 *
 * Never linked. The proxy rewrites here, with status 404, when a public
 * detail URL names no record, and `[...rest]/route.ts` serves this page's
 * HTML for paths that match no route — so a 404 is the localized page from
 * the server (lang, dir, heading, site layout) instead of Next's bare error
 * shell (see src/lib/seo/not-found-routing.ts). Its <head> comes from
 * ../not-found.tsx, which Next uses for every 404 response.
 */

import { setRequestLocale } from 'next-intl/server'

import LocaleNotFound from '../not-found'

export default async function NotFoundPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  setRequestLocale(locale)
  return <LocaleNotFound />
}
