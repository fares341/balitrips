/**
 * Traveler reviews.
 *
 * The home page's reviews section shows three; this is where its "Read all
 * reviews" button leads. Reviews are written about an activity, so each one
 * is listed with — and links to — the experience it is about.
 *
 * Built from the existing read queries (`listActivities` + the per-activity
 * `reviewsForActivity`, which already filters to approved reviews), and
 * re-rendered every ten minutes so a review approved in Studio appears
 * without a deploy.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { Icon } from '@/components/ui'
import { locales } from '@/i18n/config'
import { Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { listActivities, reviewsForActivity } from '@/lib/content/queries'
import { trustStats } from '@/lib/content/stats'

import { pageMetadata } from '../_meta'
import { toLocale } from '../_seo-hreflang'
import { PageBanner } from '../_ui/page-banner'

const PATH = '/reviews'
/** The query's own ceiling. */
const CATALOGUE_LIMIT = 200

export const revalidate = 600

type PageProps = { params: Promise<{ locale: string }> }

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })
  return pageMetadata({ locale, path: PATH, title: t('rv_title'), description: t('rv_sub') })
}

function firstGrapheme(value: string): string {
  const first = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value.trim()),
  ][0]
  return first?.segment.toUpperCase() ?? '?'
}

export default async function ReviewsPage({ params }: PageProps) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const [t, format, activities, trust] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    listActivities({ sort: 'top', limit: CATALOGUE_LIMIT, locale }),
    trustStats(),
  ])

  const groups = await Promise.all(activities.map((activity) => reviewsForActivity(activity.id)))
  const reviews = groups
    .flatMap((group, index) => {
      const activity = activities[index]
      return activity === undefined ? [] : group.map((review) => ({ review, activity }))
    })
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt))

  return (
    <main>
      <PageBanner
        tag={t('ab_trust_t')}
        title={t('rv_title')}
        subtitle={t('rv_sub')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('rv_title') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      />

      <div className="bt-band bt-band-ivory">
        <div className="wrap">
          {trust.rating !== null && (
            <div className="bt-rsummary bt-hrsummary">
              <span className="bt-rsummary-v">
                {format.number(trust.rating, {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
              <span>
                <span className="bt-rsummary-l">{t('hero_stat_rating')}</span>
                <span className="bt-rsummary-l">{t('c_reviews_n', { n: reviews.length })}</span>
              </span>
            </div>
          )}

          {reviews.length === 0 ? (
            <p className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
              {t('rv_none')}{' '}
              <Link href="/activities" style={{ fontWeight: 700, color: 'var(--forest)' }}>
                {t('navr_act')}
              </Link>
            </p>
          ) : (
            <ul className="bt-rcards" role="list">
              {reviews.map(({ review, activity }) => {
                const body = pickOptional(review.body, locale)
                const country = pickOptional(review.authorCountry, locale)
                return (
                  <li key={review.id}>
                    <Link href={activity.href} className="bt-rcard bt-hrcard">
                      <span className="bt-rcard-head">
                        <span className="bt-rcard-av" aria-hidden="true">
                          {firstGrapheme(review.authorName)}
                        </span>
                        <span>
                          <strong>{review.authorName}</strong>
                          <span className="bt-rcard-meta">
                            {format.dateTime(new Date(review.createdAt), { dateStyle: 'medium' })}
                            {country !== null && <span> · {country}</span>}
                          </span>
                        </span>
                        <span className="bt-hrcard-q" aria-hidden="true">
                          <Icon name="quote" size={22} />
                        </span>
                      </span>
                      <span className="bt-rcard-stars" role="img" aria-label={`${review.stars}/5`}>
                        <span className="bt-stars" aria-hidden="true">
                          <span className="bt-stars-track">★★★★★</span>
                          <span
                            className="bt-stars-fill"
                            style={{
                              width: `${(Math.min(5, Math.max(0, review.stars)) / 5) * 100}%`,
                            }}
                          >
                            ★★★★★
                          </span>
                        </span>
                      </span>
                      {review.isVerified && (
                        <span className="bt-hrcard-verified">
                          <Icon name="check" size={14} stroke={2.2} />
                          {t('rv_verified')}
                        </span>
                      )}
                      {body !== null && <span className="bt-rcard-b">{body}</span>}
                      <span className="bt-hrcard-about">
                        <Icon name="compass" size={15} />
                        {pick(activity.name, locale, activity.slug)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  )
}
