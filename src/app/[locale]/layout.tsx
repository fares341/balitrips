import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'

import { Footer, Header } from '@/components/layout'
import { PageViewBeacon } from '@/components/layout/page-view-beacon'
import { ToastProvider } from '@/components/shared'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { routing } from '@/i18n/routing'
import { fontVariables } from '@/styles/fonts'

// Order matters: tokens define the custom properties everything else reads,
// base owns the reset and RTL rules, then layout and components. layout.css
// and components.css must BOTH be imported — the port split some media-query
// blocks across the two files.
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/components.css'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    default: 'Bali Trips',
    template: '%s · Bali Trips',
  },
  description:
    'Your gateway to Bali — activities, private drivers, itineraries and an interactive map.',
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()

  // Opts this route into static rendering. Without it, next-intl forces
  // dynamic rendering — which would make every page uncacheable at the edge
  // and send every Riyadh/London/NY visitor on a round trip to Singapore.
  setRequestLocale(locale)

  const messages = await getMessages()
  const { dir } = localeConfig[locale as Locale]

  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {/*
            The shell is mounted once, above the route slot. Header and Footer
            therefore persist across every navigation — the scroll listener,
            the drawer and the cart badge are not torn down and rebuilt on each
            page, and the toast survives a route change so "Added to your trip"
            is still visible after the user moves on.
          */}
          <ToastProvider>
            <Header />
            {children}
            <Footer />
            <PageViewBeacon />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
