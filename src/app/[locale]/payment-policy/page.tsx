/**
 * Payment policy (owner, Oct 2026): how bookings and digital products are
 * paid. The shell is in ../_policies/policy-page.tsx.
 */

import type { Metadata } from 'next'
import { setRequestLocale } from 'next-intl/server'

import { locales } from '@/i18n/config'

import { PolicyPage, policyMetadata } from '../_policies/policy-page'
import { toLocale } from '../_seo-hreflang'

const POLICY = 'payment' as const

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale } = await params
  return policyMetadata(POLICY, toLocale(locale))
}

export default async function PaymentPolicyPage({ params }: { params: PageParams }) {
  const { locale } = await params
  setRequestLocale(locale)

  return <PolicyPage id={POLICY} locale={toLocale(locale)} />
}
