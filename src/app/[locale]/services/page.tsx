/**
 * Services catalogue — the six pillars.
 *
 * Ported from `ServicesPage` in design/handoff/sections-bt/page-static.jsx.
 *
 * The handoff's `svcs` array carried `to: "map"` — a key into the prototype's
 * `navigate()` switch, not a URL. Every tile here is a real path, so the six
 * entry points into the catalogue are crawlable, middle-clickable and
 * shareable. `ServiceCard` (already an anchor rather than the handoff's
 * `<button onClick>`) does the rest.
 *
 * Imagery is borrowed from published records via `imagePool` rather than the
 * handoff's `flickr("tegallalang,rice")` search phrases — see ./_ui/imagery.ts
 * for why those could not ship.
 *
 * Statically rendered in all three locales: nothing here reads cookies,
 * headers or search params.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import type { IconName } from '@/components/ui'
import { locales } from '@/i18n/config'
import { listActivities, listLandmarks, listPackages } from '@/lib/content/queries'
import { FEATURES } from '@/lib/features'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { imageAt, imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'
import { CUSTOM_HREF } from '../_ui/routes-extra'
import { ServiceCard } from '../_ui/service-card'

const SERVICES_HREF = '/services'

/** How many records each pool query contributes. Six tiles need six images. */
const IMAGE_POOL_LIMIT = 6

type Pillar = {
  icon: IconName
  /** Message key for the tile heading. */
  title: string
  /** Message key for the supporting line. */
  body: string
  /** Locale-agnostic destination — the next-intl `Link` adds the prefix. */
  href: string
}

/** The six services, in the design's order. */
const ALL_PILLARS: readonly Pillar[] = [
  { icon: 'pin', title: 'svc_map_t', body: 'svc_map_b', href: '/map' },
  { icon: 'compass', title: 'svc_act_t', body: 'svc_act_b', href: '/activities' },
  { icon: 'car', title: 'svc_drv_t', body: 'svc_drv_b', href: '/driver' },
  { icon: 'cal', title: 'svc_itin_t', body: 'svc_itin_b', href: '/itineraries' },
  { icon: 'star', title: 'svc_pkg_t', body: 'svc_pkg_b', href: '/packages' },
  { icon: 'sparkle', title: 'svc_cust_t', body: 'svc_cust_b', href: CUSTOM_HREF },
]

/** The driver tile is listed only while the service is on (lib/features.ts). */
const PILLARS = ALL_PILLARS.filter((pillar) => FEATURES.driver || pillar.href !== '/driver')

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
    description: t('svc_sub'),
    alternates: alternatesFor(SERVICES_HREF, locale),
    openGraph: {
      type: 'website',
      title: t('svc_title'),
      description: t('svc_sub'),
      locale,
    },
  }
}

export default async function ServicesPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)

  const [t, landmarks, activities, packages] = await Promise.all([
    getTranslations({ locale }),
    listLandmarks({ limit: IMAGE_POOL_LIMIT }),
    listActivities({ sort: 'top', limit: IMAGE_POOL_LIMIT, locale }),
    listPackages(),
  ])

  const pool = imagePool(landmarks, activities, packages)

  return (
    <main>
      <PageBanner
        image={imageAt(pool, 0)}
        tag={t('services_eyebrow')}
        title={t('svc_title')}
        subtitle={t('svc_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_services') }]}
      />

      <section className="bg-ivory">
        <div className="wrap">
          <div className="grid bt-grid-3auto">
            {PILLARS.map((pillar, index) => (
              <ServiceCard
                key={pillar.href}
                icon={pillar.icon}
                title={t(pillar.title)}
                body={t(pillar.body)}
                // The banner already claimed image 0; the tiles take the rest
                // and wrap when the pool is smaller than six.
                image={imageAt(pool, index + 1)}
                href={pillar.href}
                cta={t('c_startplan')}
                priority={index < 3}
              />
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}
