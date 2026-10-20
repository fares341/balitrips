/**
 * Staff preview of a package, draft or published (phase 3).
 *
 * Opened from Studio → Packages → "Preview" before publishing. Request-
 * rendered and never indexed; anyone who is not staff gets a 404, exactly as
 * for a package that does not exist, so a draft's slug reveals nothing.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { can } from '@/lib/auth/roles'
import { getUser } from '@/lib/auth/session'
import { getPackageBySlug } from '@/lib/content/queries'

import { PackageDetailView } from '../view'

import '@/styles/bt-activity.css'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function PackagePreviewPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>
}) {
  const { locale, slug } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const viewer = await getUser()
  if (viewer === null || !can(viewer.role, 'content.read')) notFound()

  const pkg = await getPackageBySlug(slug, { includeDraft: true })
  if (!pkg) notFound()

  return <PackageDetailView pkg={pkg} locale={locale} preview />
}
