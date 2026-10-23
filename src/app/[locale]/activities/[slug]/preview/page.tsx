/**
 * Staff preview of an activity in any status (draft, in review, archived…),
 * opened from Studio → Activities → «Preview». Request-rendered, never
 * indexed; anyone who is not staff gets a 404, exactly as for a slug that
 * does not exist. Booking is off for a page that is not public.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { can } from '@/lib/auth/roles'
import { getUser } from '@/lib/auth/session'
import { getActivityBySlug } from '@/lib/content/queries'

import { ActivityView } from '../view'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function ActivityPreviewPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const viewer = await getUser()
  if (viewer === null || !can(viewer.role, 'content.read')) notFound()

  const activity = await getActivityBySlug(slug, { includeDraft: true })
  if (!activity) notFound()

  return <ActivityView activity={activity} lang={locale} preview />
}
