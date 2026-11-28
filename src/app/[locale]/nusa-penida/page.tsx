/**
 * «نوسا بينيدا» — every Nusa Penida experience in one list (owner, Nov 2026).
 *
 * Each bookable package of every listed activity on Nusa Penida (see
 * `@/lib/content/nusa-penida`) is one row, from the lowest price per person
 * to the highest: the shared day tour first, the private tours next, and the
 * luxury boat / yacht at the end once they are published as activities whose
 * name or area says «Nusa Penida». Every name, text and price comes from the
 * database; a row with no text of its own shows its «includes» lines.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { EmptyState, LinkButton } from '@/components/bt'
import { formatPrice, PriceFrom } from '@/components/bt/card'
import { fromUnit } from '@/components/cards/from-unit'
import { Photo } from '@/components/ui/photo'
import { Link } from '@/i18n/routing'
import { pick, pickAlt, pickOptional } from '@/lib/content/localize'
import { buildLadder, isNusaPenida, NUSA_PENIDA_PATH, rowText } from '@/lib/content/nusa-penida'
import { getActivityBySlug, listActivities } from '@/lib/content/queries'
import type { ActivityDetail } from '@/lib/content/types'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'
import { CUSTOM_HREF } from '../_ui/routes-extra'

import '@/styles/bt-activity.css'

type PageProps = { params: Promise<{ locale: string }> }

async function loadActivities(locale: ReturnType<typeof toLocale>): Promise<ActivityDetail[]> {
  const listed = await listActivities({ limit: 200, locale })
  const details = await Promise.all(
    listed.filter(isNusaPenida).map((one) => getActivityBySlug(one.slug)),
  )
  return details.filter((one): one is ActivityDetail => one !== null)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return {
    title: t('np_title'),
    description: t('np_sub'),
    alternates: alternatesFor(NUSA_PENIDA_PATH, locale),
  }
}

export default async function NusaPenidaPage({ params }: PageProps) {
  const { locale: raw } = await params
  setRequestLocale(raw)
  const locale = toLocale(raw)
  const [t, activities] = await Promise.all([getTranslations({ locale }), loadActivities(locale)])
  const rows = buildLadder(activities)
  const banner = activities.find((one) => one.hero)?.hero ?? null

  return (
    <main className="np-page">
      <PageBanner
        image={banner}
        imageSrc="/brand/kelingking.webp"
        tag={t('navr_act')}
        title={t('np_title')}
        subtitle={t('np_sub')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[
          { label: t('c_home'), href: '/' },
          { label: t('navr_act'), href: '/activities' },
          { label: t('np_title') },
        ]}
      />

      <section className="sec-tight" aria-labelledby="np-list">
        <div className="wrap stack" style={{ gap: 16 }}>
          <div className="np-head">
            <h2 id="np-list" className="h3">
              {t('np_list_t')}
            </h2>
            <p className="np-scale" aria-hidden={rows.length < 2}>
              <span>{t('np_scale_low')}</span>
              <span className="np-scale-bar" />
              <span>{t('np_scale_high')}</span>
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState title={t('np_empty')} />
          ) : (
            <ol className="np-list" role="list">
              {rows.map((row, index) => {
                const activityName = pick(row.activityName, locale, row.activitySlug)
                const name = pick(row.tierName, locale, row.tierKey)
                const text = rowText(row, locale)
                const includes = row.includes
                  .map((line) => pickOptional(line, locale))
                  .filter((line): line is string => line !== null)
                const badge =
                  pickOptional(row.badge, locale) ?? (row.isPopular ? t('act_pkg_popular') : null)
                const duration = pickOptional(row.duration, locale)
                return (
                  <li key={`${row.activityId}:${row.tierKey}`} className="np-row">
                    <span className="np-n" dir="ltr">
                      {index + 1}
                    </span>
                    <Photo
                      className="np-img"
                      src={row.image?.url}
                      alt={pickAlt(row.image?.alt, locale, name)}
                      srcSetAvif={row.image?.srcSetAvif}
                      srcSetWebp={row.image?.srcSetWebp}
                      sizes="(max-width: 640px) 100vw, 240px"
                    />
                    <div className="np-body">
                      <small className="muted">{activityName}</small>
                      <h3 className="np-name">
                        <Link href={row.activityHref}>{name}</Link>
                        {badge && <span className="np-badge">{badge}</span>}
                      </h3>
                      {duration && <small className="muted">{duration}</small>}
                      {text ? (
                        <p className="np-text">{text}</p>
                      ) : includes.length > 0 ? (
                        <ul className="np-inc">
                          {includes.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="np-side">
                      <PriceFrom
                        label={t('bt_from')}
                        amount={formatPrice(row.priceMinor, row.currency, locale)}
                        minor={row.priceMinor}
                        currency={row.currency}
                        unit={fromUnit(t, row)}
                      />
                      <LinkButton href={row.activityHref} variant="forest" size="sm">
                        {t('np_details')}
                      </LinkButton>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </section>

      <section className="sec-tight">
        <div className="wrap">
          <div className="panel row between" style={{ gap: 14 }}>
            <b style={{ color: 'var(--forest)' }}>{t('np_custom_t')}</b>
            <LinkButton href={CUSTOM_HREF} variant="ghost" size="sm">
              {t('svc_cust_t')}
            </LinkButton>
          </div>
        </div>
      </section>
    </main>
  )
}
