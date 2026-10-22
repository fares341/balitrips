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

import { TierFilter } from '@/components/bt/tier-filter'
import { formatPrice } from '@/components/bt/card'
import { PackageCard } from '@/components/cards'
import { HOME_HREF } from '@/components/layout'
import { Breadcrumbs, LinkButton } from '@/components/shared'
import { Photo } from '@/components/ui'
import { isLocale, locales } from '@/i18n/config'
import { BUDGET_TIERS, parseBudgetTier, tiersFromPrices, type BudgetTier } from '@/lib/budget-tier'
import { listPackages } from '@/lib/content/queries'
import { ENTITY_PATHS, type PackageSummary } from '@/lib/content/types'
import { pick } from '@/lib/content/localize'
import { alternates } from './_meta'

import '@/styles/bt-activity.css'

const HREF = ENTITY_PATHS.package

/** Above-the-fold row on the widest breakpoint is four cards. */
const PRIORITY_CARDS = 4

/**
 * Each package's budget category, relative to the packages on sale
 * (lib/budget-tier.ts). Compared on the group price: a per-person package is
 * counted for two, the size the fixed thresholds also assumed.
 */
function packageTiers(packages: readonly PackageSummary[]): (BudgetTier | null)[] {
  return tiersFromPrices(packages, (pkg) => ({
    minor: pkg.pricingMode === 'per_guest' ? pkg.priceMinor * 2 : pkg.priceMinor,
    currency: pkg.currency,
  }))
}

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

export default async function PackagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { locale } = await params
  if (!isLocale(locale)) notFound()
  setRequestLocale(locale)

  const [t, packages, query] = await Promise.all([
    getTranslations({ locale }),
    listPackages(),
    searchParams,
  ])

  const banner = packages[0]?.hero ?? null
  /** The package's banner photo when no package has one. */
  const bannerSrc = banner?.url ?? '/brand/green-dress.jpg'

  // Budget category filter (?budget=economy|mid|luxury); unknown → all.
  const tier = parseBudgetTier(query.budget)
  const packageTierList = packageTiers(packages)
  const tiers = packages.map((pkg, index) => ({ pkg, tier: packageTierList[index] ?? null }))
  const counts = Object.fromEntries(
    BUDGET_TIERS.map((key) => [key, tiers.filter((one) => one.tier === key).length]),
  ) as Record<BudgetTier, number>
  const shown =
    tier === null ? packages : tiers.filter((one) => one.tier === tier).map((one) => one.pkg)

  return (
    <main>
      <div className="bt-banner">
        <Photo
          src={bannerSrc}
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

      {/* Package vs itinerary, fixed group price, start date (v3 packages.html) */}
      <section className="sec-tight pk-intro-sec">
        <ul className="wrap pk-intro" role="list">
          {(['pk_i1', 'pk_i2', 'pk_i3'] as const).map((key) => (
            <li key={key}>
              <b>{t(`${key}_t`)}</b>
              <span className="muted">{t(`${key}_b`)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="bg-ivory sec-tight">
        <div className="wrap stack" style={{ gap: 16 }}>
          {packages.length > 0 && (
            <TierFilter basePath={HREF} active={tier} counts={counts} total={packages.length} />
          )}
          {shown.length === 0 ? (
            <p className="muted center">{t('ah_none')}</p>
          ) : (
            <div className="grid pk-grid">
              {shown.map((pkg, index) => (
                <PackageCard key={pkg.id} pkg={pkg} priority={index < PRIORITY_CARDS} />
              ))}
            </div>
          )}

          {/* Compare packages (v3 packages.html) — real figures only */}
          {shown.length > 1 && (
            <div className="stack" style={{ gap: 12 }}>
              <h2 className="h3">{t('pk_cmp_t')}</h2>
              <div className="cmp-wrap">
                <table className="cmp">
                  <thead>
                    <tr>
                      <th scope="col">
                        <span className="sr-only">{t('pk_cmp_t')}</span>
                      </th>
                      {shown.map((pkg) => (
                        <th key={pkg.id} scope="col">
                          {pick(pkg.name, locale, pkg.slug)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">{t('pk_cmp_from')}</th>
                      {shown.map((pkg) => (
                        <td key={pkg.id}>
                          <b dir="ltr">{formatPrice(pkg.priceMinor, pkg.currency, locale)}</b>{' '}
                          <small className="muted">
                            {pkg.pricingMode === 'per_guest'
                              ? t('c_pp')
                              : t('pk_per_group', { n: pkg.maxGuests })}
                          </small>
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">{t('pk_cmp_days')}</th>
                      {shown.map((pkg) => (
                        <td key={pkg.id} dir="ltr">
                          {pkg.days}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row">{t('pk_cmp_people')}</th>
                      {shown.map((pkg) => (
                        <td key={pkg.id} dir="ltr">
                          {pkg.maxGuests}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td />
                      {shown.map((pkg) => (
                        <td key={pkg.id}>
                          <LinkButton href={pkg.href} variant="forest" size="sm">
                            {t('bt_details')}
                          </LinkButton>
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
