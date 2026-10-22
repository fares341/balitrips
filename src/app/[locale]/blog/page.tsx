/**
 * Blog hub.
 *
 * Ported from `BlogPage` in design/handoff/sections-bt/page-content.jsx: the
 * photo banner, a search field over category chips, a two-up article grid and
 * a sticky sidebar.
 *
 * The one structural change is where the filtering happens. The handoff held
 * `cat` and `q` in React state and filtered `ARTICLES` in the browser —
 * matching `a.title[lang]` only, so a query that appeared in an excerpt found
 * nothing, and `title[lang]` threw on any article a translator had not reached
 * yet. Both live in the query string now and both are applied by
 * `listArticles()` in Postgres:
 *
 *  - a filtered view has a URL, so "food guides" is a page that can be linked,
 *    bookmarked, shared and indexed rather than a transient client state;
 *  - the search form is a plain `<form method="get">` and the chips are real
 *    anchors, so the whole control surface works with JavaScript disabled;
 *  - matching covers title *and* excerpt, in the active locale *and* English,
 *    with LIKE wildcards escaped.
 *
 * Reading `searchParams` opts this route out of static prerendering — that is
 * inherent to server-side filtering and is the deliberate trade. The banner
 * and the sidebar are outside the `<Suspense>` boundary so they belong to the
 * static shell the moment PPR is switched on.
 */

import { Suspense, type ReactNode } from 'react'
import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { ArticleCard } from '@/components/cards'
import { Breadcrumbs } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import { Link } from '@/i18n/routing'
import type { Locale } from '@/i18n/config'
import { articleRequirementsByIds } from '@/lib/content/extra-queries'
import { pick, pickOptional } from '@/lib/content/localize'
import { listArticleCategories, listArticles } from '@/lib/content/queries'
import type { EntitlementKind } from '@/lib/entitlements'

import { alternatesFor, toLocale } from '../_seo-hreflang'
import { DEFAULT_SHARE_IMAGE } from '@/lib/seo/site-origin'

const BLOG_HREF = '/blog'

/** The hub's banner photo (v3 articles.html). */
const BANNER_PHOTO = '/brand/polaroids.webp'

/** How many articles the sidebar carries. Matches the handoff's `slice(0, 4)`. */
const SIDEBAR_COUNT = 4

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

/** `?q=a&q=b` is legal in a URL and meaningless here; take the first. */
function firstParam(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  if (raw === undefined) return null
  const trimmed = raw.trim()
  return trimmed === '' ? null : trimmed
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('bh_title'),
    description: t('bh_sub'),
    alternates: alternatesFor(BLOG_HREF, locale),
    openGraph: {
      images: [DEFAULT_SHARE_IMAGE],
      type: 'website',
      title: t('bh_title'),
      description: t('bh_sub'),
      locale,
    },
  }
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  setRequestLocale(raw)

  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  const sidebar = await listArticles({ locale, limit: SIDEBAR_COUNT })
  const sidebarLocks = await articleRequirementsByIds(sidebar.map((article) => article.id))
  const lockLabels = {
    map_access: t('art_badge_map'),
    vip: t('art_badge_vip'),
    basic: t('acct_subs_basic'),
  }

  return (
    <main>
      {/*
        `.bt-banner` is a photo banner in the design. There is no editorial
        image for the hub itself — the handoff synthesised one from
        `flickr("canggu,beach")`, which was a placeholder service, not content
        — so the forest fill carries it. The veil stays: it is what guarantees
        the white title clears contrast whatever sits behind it.
      */}
      <div className="bt-banner" style={{ background: 'var(--forest)' }}>
        <Photo
          src={BANNER_PHOTO}
          alt=""
          priority
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
        <div className="bt-banner-veil" />
        <div className="wrap bt-banner-inner">
          <Breadcrumbs
            light
            label={t('c_breadcrumb')}
            trail={[{ label: t('c_home'), href: '/' }, { label: t('navr_blog') }]}
          />
          <span
            className="tag"
            style={{ background: 'var(--orange)', color: '#fff', width: 'fit-content' }}
          >
            {t('bh4_eyebrow')}
          </span>
          <h1 className="bt-banner-title">{t('bh4_title')}</h1>
          <p className="bt-banner-sub">{t('bh4_sub')}</p>
        </div>
      </div>

      <section className="bg-ivory">
        <div className="wrap stack" style={{ gap: 28 }}>
          <Suspense fallback={<ResultsSkeleton label={t('c_loading')} />}>
            <BlogResults
              locale={locale}
              searchParams={searchParams}
              sidebar={
                <aside className="bt-blog-side">
                  <div className="card card-pad">
                    {/*
                      The design labels this rail "Most read". There is no view
                      counter anywhere in the schema, so the list is
                      recency-ordered and labelled as such — labelling the
                      newest four as the most read is a claim the data cannot
                      support.
                    */}
                    <h2 style={{ fontSize: 18, marginBottom: 14 }}>{t('bh_latest')}</h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {sidebar.map((article) => (
                        <Locked
                          key={article.id}
                          requirement={sidebarLocks.get(article.id)}
                          labels={lockLabels}
                          compact
                        >
                          <ArticleCard article={article} compact />
                        </Locked>
                      ))}
                    </div>
                  </div>
                </aside>
              }
            />
          </Suspense>
        </div>
      </section>
    </main>
  )
}

/**
 * Lock badge for exclusive articles (spec 2.3/2.4). Overlaid rather than
 * built into `ArticleCard`, which is shared with the home page. The card
 * itself carries only public fields — the body is never in a list.
 */
function Locked({
  requirement,
  labels,
  compact = false,
  children,
}: {
  requirement: EntitlementKind | undefined
  labels: Record<EntitlementKind, string>
  compact?: boolean
  children: ReactNode
}) {
  if (requirement === undefined) return <>{children}</>
  const label = labels[requirement]
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <span
        className="tag tag-orange"
        style={{
          position: 'absolute',
          top: compact ? 4 : 12,
          insetInlineStart: compact ? 4 : 12,
          zIndex: 1,
          fontSize: compact ? 10.5 : undefined,
          pointerEvents: 'none',
        }}
      >
        <Icon name="lock" size={compact ? 10 : 12} />
        {compact ? null : ` ${label}`}
      </span>
    </div>
  )
}

function ResultsSkeleton({ label }: { label: string }) {
  return (
    <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
      {label}
    </div>
  )
}

/**
 * The filtered half of the page.
 *
 * Split out so that awaiting `searchParams` happens inside a Suspense
 * boundary rather than at the top of the route.
 */
async function BlogResults({
  locale,
  searchParams,
  sidebar,
}: {
  locale: Locale
  searchParams: PageSearch
  sidebar: ReactNode
}) {
  const sp = await searchParams
  const q = firstParam(sp['q'])
  const categoryKey = firstParam(sp['cat'])

  const t = await getTranslations({ locale })

  const [categories, articles] = await Promise.all([
    listArticleCategories(),
    listArticles({ locale, q, categoryKey }),
  ])
  const locks = await articleRequirementsByIds(articles.map((article) => article.id))
  const lockLabels = {
    map_access: t('art_badge_map'),
    vip: t('art_badge_vip'),
    basic: t('acct_subs_basic'),
  }

  /**
   * "all" is a sentinel the seed carries as a real row, not a category an
   * article can belong to. It is dropped here and re-rendered as the first
   * chip from `map_f_all`, so the control is correct whether or not that row
   * exists in the database a given environment is pointed at.
   */
  const realCategories = categories.filter((category) => category.key !== 'all')
  const activeKey = categoryKey === 'all' ? null : categoryKey

  const chipHref = (key: string | null) => ({
    pathname: BLOG_HREF,
    query: {
      ...(key === null ? {} : { cat: key }),
      ...(q === null ? {} : { q }),
    },
  })

  // The newest article leads the unfiltered hub as the featured story (v3 articles.html).
  const featured = q === null && activeKey === null ? articles[0] : undefined
  const featuredTitle = featured ? pick(featured.title, locale, featured.slug) : ''
  const featuredExcerpt = featured ? pickOptional(featured.excerpt, locale) : null

  return (
    <>
      {featured !== undefined && (
        <Link href={featured.href} className="feat-art">
          <Photo
            src={featured.hero?.url}
            alt=""
            priority
            srcSetAvif={featured.hero?.srcSetAvif}
            srcSetWebp={featured.hero?.srcSetWebp}
            sizes="(min-width: 900px) 660px, 100vw"
          />
          <span className="c">
            <span className="tag feat-tag">{t('bh4_featured')}</span>
            <span className="h2 feat-t">{featuredTitle}</span>
            {featuredExcerpt !== null && <span>{featuredExcerpt}</span>}
            <span className="feat-go">
              {t('art_read')} <Icon name="arrow" size={16} className="flip" />
            </span>
          </span>
        </Link>
      )}

      <div className="bt-blog-controls">
        <form
          method="get"
          role="search"
          className="bt-mapsearch"
          style={{
            background: 'var(--white)',
            boxShadow: 'var(--shadow-sm)',
            border: '1px solid var(--line)',
            maxWidth: 'none',
          }}
        >
          {/*
            The active category has to survive a search, and a GET form only
            submits the fields it contains.
          */}
          {activeKey !== null && <input type="hidden" name="cat" value={activeKey} />}

          <Icon name="search" size={18} color="var(--muted)" />
          <input
            type="search"
            name="q"
            defaultValue={q ?? ''}
            placeholder={t('bh_search')}
            aria-label={t('bh_search')}
            style={{ color: 'var(--forest)' }}
          />
          {/*
            Enter already submits, but a single-field form gives touch users no
            visible way to commit the query. The control is icon-only and named
            with `c_search` — there is no bare "Search" verb in the 609-key
            catalogue, and a hard-coded one would ship English to Arabic and
            Indonesian readers.
          */}
          <button
            type="submit"
            aria-label={t('c_search')}
            style={{
              width: 40,
              height: 40,
              flexShrink: 0,
              border: 0,
              borderRadius: 999,
              background: 'var(--forest)',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
            }}
          >
            <Icon name="arrow" size={17} color="#fff" className="flip" />
          </button>
        </form>

        <div className="bt-filterchips">
          <Link
            href={chipHref(null)}
            className={`chip${activeKey === null ? ' active' : ''}`}
            aria-current={activeKey === null ? 'page' : undefined}
            style={{ minHeight: 44 }}
          >
            {t('map_f_all')}
          </Link>

          {realCategories.map((category) => {
            const active = activeKey === category.key
            return (
              <Link
                key={category.id}
                href={chipHref(category.key)}
                className={`chip${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                style={{ minHeight: 44 }}
              >
                {pick(category.label, locale, category.key)}
              </Link>
            )
          })}
        </div>
      </div>

      <div className="bt-blog-grid">
        <div className="stack" style={{ gap: 16 }}>
          <h2 className="h3">{t('bh4_newest')}</h2>
          {articles.length === 0 ? (
            <div className="muted" style={{ padding: '40px 0', textAlign: 'center' }}>
              {t('c_search_empty')}
            </div>
          ) : (
            <div className="grid bt-grid-2">
              {articles.map((article, index) => (
                <Locked key={article.id} requirement={locks.get(article.id)} labels={lockLabels}>
                  <ArticleCard article={article} priority={index < 2} />
                </Locked>
              ))}
            </div>
          )}
        </div>
        {sidebar}
      </div>
    </>
  )
}
