/**
 * Policies centre (/policies) — the owner's consolidated policies document.
 *
 * The Arabic text (policies-content.tsx) is the original; English and
 * Indonesian are faithful translations of it (policies-content.en.tsx,
 * policies-content.id.tsx), with the same section anchors. Each locale is a
 * page of its own: self-canonical, indexable, with the full hreflang set.
 *
 * The older per-policy pages (/terms, /privacy, /refund, /payment-policy,
 * /cookies) still serve en/id with their own, older wording; for ar they
 * redirect to the anchors here (next.config.ts).
 */

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'

import { defaultLocale, localeConfig, locales, type Locale } from '@/i18n/config'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

import { localeUrl, toLocale } from '../_seo-hreflang'
import { PoliciesContent } from './policies-content'
import { PoliciesContentEn } from './policies-content.en'
import { PoliciesContentId } from './policies-content.id'
import s from './policies.module.css'
import { ScrollSpy } from './scroll-spy'

type PageParams = Promise<{ locale: string }>

const HEAD: Record<Locale, { title: string; description: string }> = {
  ar: { title: 'مركز السياسات', description: 'سياسات المنصة وشروط الاستخدام — Bali Trips' },
  en: {
    title: 'Policies Centre',
    description:
      'Bali Trips platform policies and terms of use: booking, cancellation and refunds, payment, digital products, privacy, cookies, safety and complaints.',
  },
  id: {
    title: 'Pusat Kebijakan',
    description:
      'Kebijakan platform dan syarat penggunaan Bali Trips: pemesanan, pembatalan dan pengembalian dana, pembayaran, produk digital, privasi, cookie, keselamatan, dan keluhan.',
  },
}

const PATH = '/policies'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const locale = toLocale((await params).locale)
  const head = HEAD[locale]
  return {
    title: head.title,
    description: head.description,
    alternates: {
      canonical: localeUrl(PATH, locale),
      languages: {
        ...Object.fromEntries(locales.map((one) => [one, localeUrl(PATH, one)])),
        'x-default': localeUrl(PATH, defaultLocale),
      },
    },
    robots: { index: true, follow: true },
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: head.title,
      description: head.description,
      url: localeUrl(PATH, locale),
      locale,
    },
  }
}

export default async function PoliciesPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = toLocale(raw)

  return (
    <main id="top" className={s.page} dir={localeConfig[locale].dir} lang={locale} data-policies>
      {locale === 'ar' ? (
        <PoliciesContent />
      ) : locale === 'id' ? (
        <PoliciesContentId />
      ) : (
        <PoliciesContentEn />
      )}
      <ScrollSpy />
    </main>
  )
}
