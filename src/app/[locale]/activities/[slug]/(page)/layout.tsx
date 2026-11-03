/**
 * Gate for the activity page. It sits above this segment's loading.tsx
 * (Suspense) boundary, so a merged slug redirects and an unknown slug answers
 * HTTP 404 before any skeleton is streamed (otherwise the 200 status is
 * already sent and the 404 is only a "soft" noindex page).
 */

import type { ReactNode } from 'react'
import { notFound, permanentRedirect } from 'next/navigation'

import { defaultLocale, isLocale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { ENTITY_PATHS } from '@/lib/content/types'

import { findMergedSlug, findPageActivity } from '../lookup'

export default async function ActivityGate({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  const lang = isLocale(locale) ? locale : defaultLocale

  // An activity folded into another one as a package: its old link lands there.
  const mergedInto = await findMergedSlug(slug)
  if (mergedInto !== null) {
    permanentRedirect(getPathname({ href: `${ENTITY_PATHS.activity}/${mergedInto}`, locale: lang }))
  }

  if (!(await findPageActivity(slug))) notFound()

  return children
}
