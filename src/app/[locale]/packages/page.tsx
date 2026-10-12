/**
 * Packages hub.
 *
 * Ported from `PackagesPage` in design/handoff/sections-bt/page-plans.jsx —
 * banner, then the 3-up `.bt-grid-tp` grid.
 *
 * The banner photograph is the first package's hero rather than a loremflickr
 * URL synthesised from `"seminyak,beach"`, and an empty catalogue renders the
 * "nothing matches" copy instead of an empty grid.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { PackageCard } from '@/components/cards'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs } from '@/components/shared'
import { Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS } from '@/lib/content/types'
import { alternates } from './_meta'

const HREF = ENTITY_PATHS.package

/** Above-the-fold row on the widest breakpoint is three cards. */
const PRIORITY_CARDS = 3

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) notFound()

  const t = await getTranslations({ locale })

  return {
    // `ph_title` is a sentence with a full stop — right for an <h1>, wrong
    // inside the "%s · Bali Trips" template. The nav label is the title.
    title: t('svc_pkg_t'),
    description: t('ph_sub'),
    alternates: alternates(HREF, locale),
    openGraph: {
      type: 'website',
      title: t('ph_title'),
      description: t('ph_sub'),
    },
  }
}

export default async function PackagesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const [t, packages] = await Promise.all([getTranslations({ locale }), listPackages()])

  const banner = packages[0]?.hero ?? null

  return (
    <main>
      <div className="bt-banner">
        <Photo
          src={banner?.url}
          alt=""
          priority
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div className="bt-banner-veil" />
        <div className="wrap bt-banner-inner">
          <Breadcrumbs
            light
            trail={[{ label: t('c_home'), href: HOME_HREF }, { label: t('svc_pkg_t') }]}
          />
          <span
            className="tag"
            style={{ background: 'var(--orange)', color: '#fff', width: 'fit-content' }}
          >
            {t('tp_eyebrow')}
          </span>
          <h1 className="bt-banner-title">{t('ph_title')}</h1>
          <p className="bt-banner-sub">{t('ph_sub')}</p>
        </div>
      </div>

      <section className="bg-ivory">
        <div className="wrap">
          {packages.length === 0 ? (
            <p className="muted center">{t('ah_none')}</p>
          ) : (
            <div className="grid bt-grid-tp">
              {packages.map((pkg, index) => (
                <PackageCard key={pkg.id} pkg={pkg} priority={index < PRIORITY_CARDS} />
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
