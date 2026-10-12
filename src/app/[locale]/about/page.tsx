/**
 * About — the brand page.
 *
 * Ported from `AboutPage` in design/handoff/sections-bt/page-static.jsx: the
 * story column beside a photo wall, vision and mission cards, the "Why Bali?"
 * band on the forest surface, three values, the trust stats and the reviews
 * rail.
 *
 * Three things the handoff did that are not carried over:
 *
 *  1. **`<Head eyebrow="ab_values_t" title="ab_values_t" />`.** The values and
 *     trust sections passed the same message key as both the eyebrow and the
 *     heading, so each rendered its title twice, stacked. They carry one
 *     heading each here.
 *  2. **A photo wall of `flickr("uluwatu,temple")` URLs.** Six stock
 *     photographs from a third party, with no licence record and no guarantee
 *     the subject is even in Bali. The wall borrows hero images from published
 *     records; where there are none, `<Photo>` renders its neutral surface.
 *  3. **`ReviewsBlock tags={[...]}`.** The prototype filtered a shared review
 *     pool by tag overlap and fell back to `slice(0, 3)`, printing reviews of
 *     one experience under another. Reviews belong to an activity, so the rail
 *     is the union of the top activities' own reviews, newest first.
 *
 * Statically rendered in all three locales.
 */

import type { Metadata } from 'next'
import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server'

import { ReviewCard } from '@/components/cards'
import { SectionHead } from '@/components/shared'
import { Icon, Photo, type IconName } from '@/components/ui'
import { locales } from '@/i18n/config'
import {
  listActivities,
  listLandmarks,
  listRegions,
  reviewsForActivity,
} from '@/lib/content/queries'
import { trustStats } from '@/lib/content/stats'
import type { ReviewDto } from '@/lib/content/types'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { imagePool } from '../_ui/imagery'
import { PageBanner } from '../_ui/page-banner'

const ABOUT_HREF = '/about'

/** Tiles in the photo wall, as in the handoff. */
const WALL_SIZE = 6

/** How many activities seed the review rail. */
const REVIEW_SOURCE_COUNT = 6

/** How many reviews the rail holds. */
const REVIEW_COUNT = 9

/** The three values, in the design's order. */
const VALUES: readonly { icon: IconName; title: string; body: string }[] = [
  { icon: 'shield', title: 'ab_v1_t', body: 'ab_v1_b' },
  { icon: 'heart', title: 'ab_v2_t', body: 'ab_v2_b' },
  { icon: 'compass', title: 'ab_v3_t', body: 'ab_v3_b' },
]

type PageParams = Promise<{ locale: string }>

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

/** Newest first, across every activity's review set. */
function newestFirst(a: ReviewDto, b: ReviewDto): number {
  return b.createdAt.localeCompare(a.createdAt)
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('navr_about'),
    description: t('about_p1'),
    alternates: alternatesFor(ABOUT_HREF, locale),
    openGraph: {
      type: 'website',
      title: t('ab_hero_t'),
      description: t('about_p1'),
      locale,
    },
  }
}

export default async function AboutPage({ params }: { params: PageParams }) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)

  const [t, format, regions, landmarks, topActivities, trust] = await Promise.all([
    getTranslations({ locale }),
    getFormatter({ locale }),
    listRegions(),
    listLandmarks({ limit: WALL_SIZE + 1 }),
    listActivities({ sort: 'top', limit: REVIEW_SOURCE_COUNT, locale }),
    trustStats(),
  ])

  const reviewGroups = await Promise.all(
    topActivities.map((activity) => reviewsForActivity(activity.id)),
  )
  const reviews = reviewGroups.flat().sort(newestFirst).slice(0, REVIEW_COUNT)

  const pool = imagePool(landmarks, topActivities)
  const wall = Array.from({ length: WALL_SIZE }, (_, index) =>
    pool.length === 0 ? null : (pool[index % pool.length] ?? null),
  )

  /**
   * Trust figures — all measured (src/lib/content/stats.ts). A figure below
   * its meaningful minimum is left out rather than padded with a design claim.
   */
  const stats: readonly { value: string; label: string }[] = [
    ...(trust.places > 0 ? [{ value: format.number(trust.places), label: t('ab_stat1') }] : []),
    { value: format.number(regions.length), label: t('ab_stat2') },
    ...(trust.rating !== null
      ? [
          {
            value: `${format.number(trust.rating, { maximumFractionDigits: 1 })}★`,
            label: t('ab_stat3'),
          },
        ]
      : []),
    ...(trust.trips !== null
      ? [{ value: format.number(trust.trips, { notation: 'compact' }), label: t('ab_stat4') }]
      : []),
  ]

  return (
    <main>
      <PageBanner
        image={pool[0] ?? null}
        tag={t('about_eyebrow')}
        title={t('ab_hero_t')}
        breadcrumbLabel={t('c_breadcrumb')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_about') }]}
      />

      {/* Story, vision and mission, beside the photo wall. */}
      <section className="bg-ivory" aria-labelledby="about-story">
        <div className="wrap bt-about2">
          <div>
            {/*
              An `h2` rather than the handoff's `<div className="eyebrow">`:
              the story is a section of the document and needs to appear in the
              outline. `.eyebrow` out-specifies the element rules in base.css,
              so it looks identical.
            */}
            <h2 id="about-story" className="eyebrow">
              <span
                aria-hidden="true"
                style={{ width: 18, height: 2, background: 'var(--orange)', borderRadius: 2 }}
              />
              {t('ab_story_t')}
            </h2>

            <p className="lede" style={{ marginTop: 16 }}>
              {t('about_p1')}
            </p>
            <p className="lede" style={{ marginTop: 14 }}>
              {t('about_p2')}
            </p>

            <div className="bt-vm">
              <div className="card card-pad">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="bt-vm-ic" style={{ background: 'var(--palm-soft)' }}>
                    <Icon name="compass" size={18} color="var(--forest)" />
                  </span>
                  <h3 style={{ fontSize: 17 }}>{t('about_vision_t')}</h3>
                </div>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                  {t('about_vision')}
                </p>
              </div>

              <div className="card card-pad">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span className="bt-vm-ic" style={{ background: 'rgba(255,144,0,0.16)' }}>
                    <Icon name="sparkle" size={18} color="var(--orange-deep)" />
                  </span>
                  <h3 style={{ fontSize: 17 }}>{t('about_mission_t')}</h3>
                </div>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                  {t('about_mission')}
                </p>
              </div>
            </div>
          </div>

          {/* Decorative: the copy beside it carries the meaning, so alt is empty. */}
          <div className="bt-about2-wall" aria-hidden="true">
            {wall.map((image, index) => (
              <Photo
                key={image?.id ?? `wall-${index}`}
                src={image?.url}
                alt=""
                radius={16}
                style={{ height: index % 3 === 0 ? 220 : 160 }}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Why Bali? */}
      <section className="bg-forest" aria-labelledby="about-why">
        <div className="wrap center">
          <h2 id="about-why" className="section-title" style={{ color: 'var(--ivory)' }}>
            {t('ab_why_t')}
          </h2>
          <p className="lede" style={{ maxWidth: '60ch', margin: '16px auto 0' }}>
            {t('ab_why_b')}
          </p>
        </div>
      </section>

      {/* Values. */}
      <section className="bg-ivory" aria-labelledby="about-values">
        <div className="wrap">
          <SectionHead id="about-values" title={t('ab_values_t')} centered />
          <div className="grid bt-grid-3auto">
            {VALUES.map((value) => (
              <div
                key={value.title}
                className="card card-pad center"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: 'var(--palm-soft)',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  <Icon name={value.icon} size={26} color="var(--forest)" />
                </span>
                <h3 style={{ fontSize: 19 }}>{t(value.title)}</h3>
                <p className="muted" style={{ fontSize: 14, margin: 0 }}>
                  {t(value.body)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust stats. */}
      <section className="bg-ivory-2" aria-labelledby="about-trust">
        <div className="wrap">
          <SectionHead id="about-trust" title={t('ab_trust_t')} centered />
          <div className="bt-statrow" style={{ marginTop: 0 }}>
            {stats.map((stat) => (
              <div key={stat.label} className="bt-stat">
                <div className="bt-stat-v">{stat.value}</div>
                <div className="bt-stat-l">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews. Absent rather than empty when there is nothing published. */}
      {reviews.length > 0 && (
        <section className="bg-ivory" aria-labelledby="about-reviews">
          <div className="wrap">
            <SectionHead
              id="about-reviews"
              eyebrow={t('rev_eyebrow')}
              title={t('rev_title')}
              centered
            />
            <div className="hscroll" style={{ gap: 16 }}>
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} />
              ))}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
