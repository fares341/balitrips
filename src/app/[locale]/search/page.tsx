/**
 * Search — v3 screens 20 / 20b (design-reference/prototype/search.html).
 *
 * A page, not an overlay (popups are only for confirmations): the query box,
 * type chips with real counts, then the hits grouped by type, each row
 * opening its own page. No query: popular searches. No hits: the empty
 * state with the map and a custom trip.
 *
 * Server-rendered from `search()` (published content only; free map places
 * only, as the shared endpoint), so the results page works without
 * JavaScript and a search is a shareable URL. Not indexed.
 */

import type { Metadata } from 'next'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { LinkButton } from '@/components/bt'
import { Icon, type IconName } from '@/components/ui'
import { getPathname, Link } from '@/i18n/routing'
import { pick, pickOptional } from '@/lib/content/localize'
import { search } from '@/lib/content/queries'
import type { SearchHit, SearchHitType } from '@/lib/content/types'

import { toLocale } from '../_seo-hreflang'
import { PlainHead } from '../_ui/plain-head'
import { CUSTOM_HREF } from '../_ui/routes-extra'

type PageParams = Promise<{ locale: string }>
type PageSearch = Promise<Record<string, string | string[] | undefined>>

const MAX_QUERY_LENGTH = 64
const PER_TYPE = 12

const TYPES: readonly { type: SearchHitType; icon: IconName; label: string }[] = [
  { type: 'activity', icon: 'compass', label: 'sr4_t_activity' },
  { type: 'place', icon: 'pin', label: 'sr4_t_place' },
  { type: 'itinerary', icon: 'doc', label: 'sr4_t_itinerary' },
  { type: 'package', icon: 'box', label: 'sr4_t_package' },
  { type: 'article', icon: 'chat', label: 'sr4_t_article' },
]

/** Popular searches shown before a query (message keys; each is a search). */
const POPULAR = ['sr4_p1', 'sr4_p2', 'sr4_p3', 'sr4_p4', 'sr4_p5', 'sr4_p6'] as const

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  const t = await getTranslations({ locale })

  return {
    title: t('srch_t'),
    description: t('c_search'),
    // A search results page has nothing of its own to index.
    robots: { index: false, follow: true },
  }
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: PageParams
  searchParams: PageSearch
}) {
  const { locale: raw } = await params
  const locale = toLocale(raw)
  setRequestLocale(locale)

  const t = await getTranslations({ locale })
  const query = await searchParams
  const q = first(query.q).trim().slice(0, MAX_QUERY_LENGTH)
  const typeParam = first(query.type)
  const active = TYPES.some((entry) => entry.type === typeParam)
    ? (typeParam as SearchHitType)
    : null

  let hits: SearchHit[] = []
  if (q.length >= 2) {
    try {
      hits = await search(q, locale, PER_TYPE)
    } catch (error) {
      // A search box is not worth a 500 page: the empty state is shown.
      console.error('[search] query failed', error)
    }
  }

  const action = getPathname({ href: '/search', locale })
  const href = (type: SearchHitType | null) => ({
    pathname: '/search',
    query: { q, ...(type === null ? {} : { type }) },
  })
  const count = (type: SearchHitType) => hits.filter((hit) => hit.type === type).length
  const groups = TYPES.filter((entry) => active === null || entry.type === active)
    .map((entry) => ({ ...entry, hits: hits.filter((hit) => hit.type === entry.type) }))
    .filter((group) => group.hits.length > 0)

  return (
    <main className="sr-page">
      <PlainHead
        title={t('sr4_title')}
        trail={[{ label: t('c_home'), href: '/' }, { label: t('sr4_crumb') }]}
        breadcrumbLabel={t('c_breadcrumb')}
      >
        <form className="sr-box" action={action} method="get" role="search">
          <Icon name="search" size={20} />
          <label htmlFor="sr-q" className="sr-only">
            {t('sr4_label')}
          </label>
          <input
            id="sr-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t('hv4_search_ph')}
            autoComplete="off"
            enterKeyHint="search"
            maxLength={MAX_QUERY_LENGTH}
          />
          {active !== null && <input type="hidden" name="type" value={active} />}
          {q !== '' && (
            <Link href="/search" className="sr-clear" aria-label={t('sr4_clear')}>
              <Icon name="cross" size={16} stroke={2.4} />
            </Link>
          )}
          <button className="btn btn-forest btn-sm" type="submit">
            {t('sr4_btn')}
          </button>
        </form>
      </PlainHead>

      <section className="sec-tight">
        <div className="wrap stack" style={{ gap: 18 }}>
          {q.length < 2 ? (
            <div className="stack" style={{ gap: 10 }}>
              <b style={{ color: 'var(--forest)' }}>{t('sr4_popular')}</b>
              <div className="chips">
                {POPULAR.map((key) => (
                  <Link
                    key={key}
                    className="chip"
                    href={{ pathname: '/search', query: { q: t(key) } }}
                  >
                    {t(key)}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <>
              <nav className="chips scroll" aria-label={t('sr4_types')}>
                <Link
                  className="chip"
                  href={href(null)}
                  aria-current={active === null ? 'page' : undefined}
                >
                  {t('bud_all')}{' '}
                  <span className="ct" dir="ltr">
                    {hits.length}
                  </span>
                </Link>
                {TYPES.map((entry) => (
                  <Link
                    key={entry.type}
                    className="chip"
                    href={href(entry.type)}
                    aria-current={active === entry.type ? 'page' : undefined}
                  >
                    {t(entry.label)}{' '}
                    <span className="ct" dir="ltr">
                      {count(entry.type)}
                    </span>
                  </Link>
                ))}
              </nav>

              {groups.length === 0 ? (
                <div className="panel empty sr-empty">
                  <span className="ill" aria-hidden="true">
                    <Icon name="search" size={34} />
                  </span>
                  <b>{t('sr4_none_t', { q })}</b>
                  <p className="muted">{t('sr4_none_b')}</p>
                  <div className="row" style={{ justifyContent: 'center' }}>
                    <LinkButton href="/map" variant="forest">
                      {t('sr4_none_map')}
                    </LinkButton>
                    <LinkButton href={CUSTOM_HREF} variant="ghost">
                      {t('hv3_ct_request')}
                    </LinkButton>
                  </div>
                </div>
              ) : (
                groups.map((group) => (
                  <section
                    key={group.type}
                    className="sr-group"
                    aria-labelledby={`sr-${group.type}`}
                  >
                    <h2 className="h3" id={`sr-${group.type}`}>
                      <Icon name={group.icon} size={18} /> {t(group.label)}{' '}
                      <span className="sr-n" dir="ltr">
                        {group.hits.length}
                      </span>
                    </h2>
                    <ul className="sr-list" role="list">
                      {group.hits.map((hit) => {
                        const subtitle =
                          hit.subtitle === null ? null : pickOptional(hit.subtitle, locale)
                        return (
                          <li key={hit.id}>
                            <Link href={hit.href} className="sr-row">
                              {hit.hero?.url ? (
                                // eslint-disable-next-line @next/next/no-img-element -- small catalogue thumbnail
                                <img src={hit.hero.url} alt="" loading="lazy" />
                              ) : (
                                <span className="sr-ph" aria-hidden="true">
                                  <Icon name={group.icon} size={22} />
                                </span>
                              )}
                              <span className="sr-b">
                                <b>{pick(hit.title, locale, hit.slug)}</b>
                                {(subtitle !== null || hit.days !== null) && (
                                  <small className="muted">
                                    {[
                                      subtitle,
                                      hit.days !== null ? t('c_days_n', { n: hit.days }) : null,
                                    ]
                                      .filter((part): part is string => part !== null)
                                      .join(' · ')}
                                  </small>
                                )}
                              </span>
                              <Icon name="chevronr" size={18} className="flip" />
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))
              )}
            </>
          )}
        </div>
      </section>
    </main>
  )
}
