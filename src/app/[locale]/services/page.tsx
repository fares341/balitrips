/**
 * Services — v3 screen 02 (design-reference/prototype/services.html).
 *
 *   banner · one photo card per service (the map marked "Signature") ·
 *   "how it works" in four steps · "answer two questions" suggestions
 *
 * No driver card while that service is off (lib/features.ts). The
 * suggestions come from the real catalogue (itineraries and packages), see
 * `./start-quiz.tsx`; nothing is invented.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { formatPrice } from '@/components/bt/card'
import { Icon, type IconName } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick } from '@/lib/content/localize'
import { listItineraries, listPackages } from '@/lib/content/queries'
import { FEATURES } from '@/lib/features'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { StartQuiz, type QuizOption } from './start-quiz'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

const SERVICES_HREF = '/services'

type Service = {
  icon: IconName
  key: string
  image: string
  href: string
  /** The package marks the map as the signature service. */
  signature?: boolean
}

const ALL_SERVICES: readonly Service[] = [
  { icon: 'map', key: 'map', image: '/map/bali-satellite.webp', href: '/map', signature: true },
  { icon: 'compass', key: 'act', image: '/brand/jeep.webp', href: '/activities' },
  { icon: 'doc', key: 'itin', image: '/brand/flatlay.webp', href: '/itineraries' },
  { icon: 'box', key: 'pkg', image: '/brand/green-dress.webp', href: '/packages' },
  { icon: 'wand', key: 'cust', image: '/brand/consultant.webp', href: CUSTOM_HREF },
  { icon: 'car', key: 'drv', image: '/brand/driver-car.webp', href: '/driver' },
]

/** The driver card is listed only while the service is on (lib/features.ts). */
const SERVICES = ALL_SERVICES.filter((service) => FEATURES.driver || service.key !== 'drv')

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_services'),
    description: t('sv4_sub'),
    alternates: alternatesFor(SERVICES_HREF, locale),
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: t('sv4_title'),
      description: t('sv4_sub'),
      locale,
    },
  }
}

export default async function ServicesPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)

  const [t, itineraries, packages] = await Promise.all([
    getTranslations({ locale }),
    listItineraries(),
    listPackages(),
  ])

  const toOption = (
    kind: 'itinerary' | 'package',
    item: {
      id: string
      href: string
      slug: string
      name: Parameters<typeof pick>[0]
      days: number
      priceMinor: number
      currency: string
      hero: { url: string } | null
    },
    extra: { maxGuests?: number } = {},
  ): QuizOption => ({
    id: item.id,
    kind,
    href: item.href,
    name: pick(item.name, locale, item.slug),
    days: item.days,
    maxGuests: extra.maxGuests ?? null,
    price: formatPrice(item.priceMinor, item.currency, locale),
    image: item.hero?.url ?? null,
  })

  return (
    <main>
      <PageBanner
        image={null}
        imageSrc="/brand/flatlay-wide.webp"
        tag={t('sv4_eyebrow')}
        title={t('sv4_title')}
        subtitle={t('sv4_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_services') }]}
      />

      <section className="sec">
        <div className="wrap">
          <ul className="sv-grid" role="list">
            {SERVICES.map((service, index) => (
              <li key={service.key}>
                <Link href={service.href} className="sv-card">
                  <div className="m">
                    {/* eslint-disable-next-line @next/next/no-img-element -- fixed brand photo */}
                    <img src={service.image} alt="" loading={index < 3 ? 'eager' : 'lazy'} />
                    {service.signature === true && (
                      <span className="tag sv-usp">{t('sv4_signature')}</span>
                    )}
                    <span className="ic" aria-hidden="true">
                      <Icon name={service.icon} size={26} />
                    </span>
                  </div>
                  <div className="b">
                    <h2>{t(`sv4_${service.key}_t`)}</h2>
                    <span className="muted">{t(`sv4_${service.key}_d`)}</span>
                    <span className="btn btn-forest btn-sm">
                      {t(`sv4_${service.key}_go`)} <Icon name="arrow" size={16} className="flip" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec bg-ivory2">
        <div className="wrap stack" style={{ gap: 24 }}>
          <div className="stack" style={{ gap: 8 }}>
            <span className="eyebrow">{t('sv4_how_eyebrow')}</span>
            <h2 className="h2">{t('sv4_how_title')}</h2>
          </div>
          <ol className="sv-steps">
            {([1, 2, 3, 4] as const).map((n) => (
              <li key={n}>
                <span className="n" dir="ltr" aria-hidden="true">
                  {n}
                </span>
                <b>{t(`sv4_how${n}_t`)}</b>
                <span className="muted">{t(`sv4_how${n}_b`)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {(itineraries.length > 0 || packages.length > 0) && (
        <section className="sec">
          <StartQuiz
            itineraries={itineraries.map((itinerary) => toOption('itinerary', itinerary))}
            packages={packages.map((pkg) => toOption('package', pkg, { maxGuests: pkg.maxGuests }))}
            customHref={CUSTOM_HREF}
          />
        </section>
      )}
    </main>
  )
}
