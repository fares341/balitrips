/**
 * Policies centre (/policies) — the owner's consolidated policies document.
 *
 * Arabic only for now: every locale renders the Arabic text right-to-left
 * (English and Indonesian wording pending). The older per-policy pages
 * (/terms, /privacy, /refund, /payment-policy, /cookies) still serve en/id;
 * for ar they redirect to the anchors here (next.config.ts).
 */

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'

import { locales } from '@/i18n/config'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { localeUrl, toLocale } from '../_seo-hreflang'
import { PoliciesContent } from './policies-content'
import s from './policies.module.css'
import { ScrollSpy } from './scroll-spy'

type PageParams = Promise<{ locale: string }>

const TITLE = 'مركز السياسات'
const DESCRIPTION = 'سياسات المنصة وشروط الاستخدام — Bali Trips'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const locale = toLocale((await params).locale)
  return {
    title: TITLE,
    description: DESCRIPTION,
    // One text (Arabic) for now: the ar URL is canonical; en/id copies are not indexed.
    alternates: { canonical: localeUrl('/policies', 'ar') },
    robots: { index: locale === 'ar', follow: true },
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: TITLE,
      description: DESCRIPTION,
      locale: 'ar',
    },
  }
}

export default async function PoliciesPage({ params }: { params: PageParams }) {
  const { locale } = await params
  setRequestLocale(locale)

  return (
    <main id="top" className={s.page} dir="rtl" lang="ar" data-policies>
      <PoliciesContent />
      <ScrollSpy />
    </main>
  )
}
