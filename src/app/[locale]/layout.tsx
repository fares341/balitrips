import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { hasLocale } from 'next-intl'

import { Footer, Header, Tabbar } from '@/components/layout'
import { PageViewBeacon } from '@/components/layout/page-view-beacon'
import { ConsentBanner } from '@/components/analytics/consent-banner'
import { Tracking } from '@/components/analytics/tracking'
import { ErrorBeacon } from '@/components/monitoring/error-beacon'
import { WhatsAppFab } from '@/components/layout/whatsapp-fab'
import { ContactProvider } from '@/components/layout/contact-context'
import { getContact } from '@/components/layout/contact-server'
import { hiddenHrefs } from '@/lib/content/public-sections'
import { loadPublicSections } from '@/lib/content/public-sections-server'
import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { ToastProvider } from '@/components/shared'
import { CurrencyProvider } from '@/components/currency/currency-context'
import { localeConfig, locales, type Locale } from '@/i18n/config'
import { routing } from '@/i18n/routing'
import { fontVariables } from '@/styles/fonts'
import { DEFAULT_SHARE_IMAGE, SHARE_ORIGIN } from '@/lib/seo/site-origin'

// Order matters: tokens define the custom properties everything else reads,
// base owns the reset and RTL rules, then layout and components. layout.css
// and components.css must BOTH be imported — the port split some media-query
// blocks across the two files.
import '@/styles/tokens.css'
import '@/styles/base.css'
import '@/styles/layout.css'
import '@/styles/components.css'
// The premium layer (header, home, plans, detail hero, footer). Last, so it
// refines the base components rather than being overridden by them.
import '@/styles/premium.css'
// v3 design system (design-reference/prototype/assets/bt.css). Last: it is
// the authority wherever it shares a class name with the sheets above.
import '@/styles/bt.css'
// v3 home page sections (scoped to `.home-v3`), after bt.css.
import '@/styles/bt-home.css'
// Website assistant (floating button + chat panel).
import '@/styles/bt-assistant.css'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    default: 'Bali Trips',
    template: '%s · Bali Trips',
  },
  description: 'Your gateway to Bali — activities, itineraries, packages and an interactive map.',
  // Relative og:image / twitter:image URLs resolve against this.
  metadataBase: new URL(SHARE_ORIGIN),
  openGraph: { siteName: 'Bali Trips', type: 'website', images: [DEFAULT_SHARE_IMAGE] },
  twitter: { card: 'summary_large_image', images: [DEFAULT_SHARE_IMAGE.url] },
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

  const [messages, contact, sections] = await Promise.all([
    getMessages(),
    getContact(),
    loadPublicSections(),
  ])
  // Owner, Oct 2026: empty sections (no package / article yet) leave the nav.
  const hidden = hiddenHrefs(sections)
  const { dir } = localeConfig[locale as Locale]

  return (
    <html lang={locale} dir={dir} className={fontVariables}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <ContactProvider value={contact}>
            <CurrencyProvider>
              {/*
            The shell is mounted once, above the route slot. Header and Footer
            therefore persist across every navigation — the scroll listener,
            the drawer and the cart badge are not torn down and rebuilt on each
            page, and the toast survives a route change so "Added to your trip"
            is still visible after the user moves on.
          */}
              <ToastProvider>
                <SkipLink />
                <Header hidden={hidden} />
                {/*
              Skip-link target. A wrapper rather than an id on each page's
              <main>: every route renders its own <main>, and the header puts
              a twelve-link nav in front of all of them.
            */}
                <div id="main" tabIndex={-1} style={{ outline: 'none' }}>
                  {children}
                </div>
                <Footer hidden={hidden} />
                <WhatsAppFab />
                <AssistantLauncher />
                <PageViewBeacon />
                {/* Phase 5: cookie choice, then first-party analytics and (only
                with consent) the marketing tags. Both render nothing on the
                server, so pages stay static. */}
                <ConsentBanner />
                <Tracking />
                <ErrorBeacon />
                {/* Mobile bottom tab bar. Must stay a direct child of <body>
                (providers render no DOM): bt.css reserves its height with
                `body:has(> .tabbar)`. */}
                <Tabbar />
              </ToastProvider>
            </CurrencyProvider>
          </ContactProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}

/** First focusable element on every page; visible only when focused. */
async function SkipLink() {
  const t = await getTranslations()
  return (
    <a href="#main" className="bt-skip">
      {t('c_skip')}
    </a>
  )
}
