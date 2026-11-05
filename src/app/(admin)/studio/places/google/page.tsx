import { and, asc, count, eq, isNull, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { mapPlaces, regions } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import {
  BILLABLE,
  GoogleCapError,
  type GoogleCallKind,
  type PlaceSummary,
  type TextSearchHit,
} from '@/lib/google-places/client'
import { dailyCap, googlePhotosEnabled } from '@/lib/google-places/config'
import { matchProgress } from '@/lib/google-places/match-job'
import { searchQuery } from '@/lib/google-places/match-score'
import { googleClient } from '@/lib/google-places/server'
import { recentGoogleUsage, usageDay } from '@/lib/google-places/usage'
import { haversineMeters } from '@/lib/map/distance'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { buildQuery, pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill, Table } from '../../../_ui/table'
import { decideMatch } from './actions'
import { MatchPanel } from './match-panel'

export const dynamic = 'force-dynamic'

const PAGE = adminHref('/places/google')
const PAGE_SIZE = 15
const TABS = ['review', 'auto', 'confirmed', 'rejected', 'none'] as const
type Tab = (typeof TABS)[number]
const KINDS: GoogleCallKind[] = ['photo_media', 'text_search', 'details_pro', 'details_photos']

/** A Google Maps link from a place ID alone (no API call). */
function mapsLink(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(placeId)}`
}

export default async function GooglePhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const enabled = googlePhotosEnabled()
  const rawTab = param(params, 'tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as Tab) : 'review'
  const page = pageParam(params)
  const searchFor = param(params, 'search')
  const searchText = param(params, 'q')
  const back = `${PAGE}${buildQuery(params, { search: null, q: null })}`

  const live = isNull(mapPlaces.deletedAt)
  const [statusRows, [uncheckedRow], rows, [totalRow], usage] = await Promise.all([
    db
      .select({ status: mapPlaces.googleMatchStatus, n: count() })
      .from(mapPlaces)
      .where(live)
      .groupBy(mapPlaces.googleMatchStatus),
    db
      .select({ n: count() })
      .from(mapPlaces)
      .where(and(live, eq(mapPlaces.googleMatchStatus, 'none'), isNull(mapPlaces.googleCheckedAt))),
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        googlePlaceId: mapPlaces.googlePlaceId,
        score: mapPlaces.googleMatchScore,
        checkedAt: mapPlaces.googleCheckedAt,
        regionKey: regions.key,
        regionLabel: regions.label,
      })
      .from(mapPlaces)
      .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
      .where(and(live, eq(mapPlaces.googleMatchStatus, tab)))
      .orderBy(sql`${mapPlaces.googleMatchScore} desc nulls last`, asc(mapPlaces.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ n: count() })
      .from(mapPlaces)
      .where(and(live, eq(mapPlaces.googleMatchStatus, tab))),
    recentGoogleUsage(31),
  ])
  const counts = Object.fromEntries(statusRows.map((row) => [row.status, row.n]))

  // Live candidate details for the review tab only (Place Details Pro, one
  // per row shown); nothing from Google is stored.
  const client = enabled ? googleClient() : null
  const summaries = new Map<string, PlaceSummary | null>()
  if (client && tab === 'review') {
    await Promise.all(
      rows.map(async (row) => {
        if (!row.googlePlaceId) return
        try {
          summaries.set(row.id, await client.placeSummary(row.googlePlaceId))
        } catch {
          summaries.set(row.id, null)
        }
      }),
    )
  }

  // «Search again» for one place.
  let searchRow: (typeof rows)[number] | undefined
  let searchHits: TextSearchHit[] | null = null
  let searchError: string | null = null
  let searchQ = ''
  if (client && searchFor) {
    const [row] = await db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        googlePlaceId: mapPlaces.googlePlaceId,
        score: mapPlaces.googleMatchScore,
        checkedAt: mapPlaces.googleCheckedAt,
        regionKey: regions.key,
        regionLabel: regions.label,
      })
      .from(mapPlaces)
      .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
      .where(and(live, eq(mapPlaces.id, searchFor)))
      .limit(1)
    if (row) {
      searchRow = row
      searchQ =
        searchText?.trim() ||
        searchQuery(
          pick(row.name, 'en', row.slug),
          row.regionLabel ? pick(row.regionLabel, 'en') : null,
        )
      try {
        searchHits = await client.textSearch({
          query: searchQ.slice(0, 200),
          lat: row.lat,
          lon: row.lon,
          radiusM: 3000,
          withAddress: true,
          max: 8,
        })
      } catch (error) {
        searchError = error instanceof GoogleCapError ? t('gp.err_cap') : t('gp.err_google')
      }
    }
  }

  // Usage: per day, and this month's totals.
  const byDay = new Map<string, Record<string, number>>()
  for (const row of usage) {
    const day = byDay.get(row.day) ?? {}
    day[row.kind] = row.count
    byDay.set(row.day, day)
  }
  const month = usageDay().slice(0, 7)
  const monthTotals: Record<string, number> = {}
  for (const row of usage) {
    if (!row.day.startsWith(month)) continue
    monthTotals[row.kind] = (monthTotals[row.kind] ?? 0) + row.count
  }
  const billableOf = (rec: Record<string, number>) =>
    [...BILLABLE].reduce((sum, kind) => sum + (rec[kind] ?? 0), 0)

  const tabHref = (one: Tab) => `${PAGE}?tab=${one}`

  return (
    <>
      <PageHead
        title={t('gp.title')}
        description={t('gp.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/places')}>
            {t('nav.places')}
          </Link>
        }
      />
      <Flash searchParams={params} />
      {!enabled ? (
        <div className="a-card" role="status" data-testid="gp-off">
          {t('gp.off')}
        </div>
      ) : null}

      <p data-testid="gp-counts">
        {t('gp.counts', {
          auto: counts.auto ?? 0,
          confirmed: counts.confirmed ?? 0,
          review: counts.review ?? 0,
          rejected: counts.rejected ?? 0,
          none: counts.none ?? 0,
          unchecked: uncheckedRow?.n ?? 0,
        })}
      </p>

      <MatchPanel initial={matchProgress()} enabled={enabled} />

      {searchRow ? (
        <div className="a-card" data-testid="gp-search">
          <h2 style={{ marginTop: 0 }}>{t('gp.search_results', { q: searchQ })}</h2>
          <form className="a-row" method="get" action={PAGE}>
            <input type="hidden" name="tab" value={tab} />
            <input type="hidden" name="search" value={searchRow.id} />
            <div className="a-field">
              <label htmlFor="gp-q">{t('gp.search_query')}</label>
              <input className="a-input" id="gp-q" name="q" defaultValue={searchQ} />
            </div>
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('gp.search_again')}
              </button>
            </div>
          </form>
          {searchError ? <p className="a-error">{searchError}</p> : null}
          {searchHits && searchHits.length === 0 ? <Empty>{t('gp.no_results')}</Empty> : null}
          {searchHits && searchHits.length > 0 ? (
            <Table>
              <tbody>
                {searchHits.map((hit) => (
                  <tr key={hit.id}>
                    <td>
                      <b>{hit.name}</b>
                      <div className="a-muted">{hit.address}</div>
                    </td>
                    <td>
                      {t('gp.distance', {
                        m: Math.round(haversineMeters(searchRow, { lat: hit.lat, lon: hit.lon })),
                      })}
                    </td>
                    <td>
                      <a href={mapsLink(hit.id)} target="_blank" rel="noopener noreferrer">
                        {t('gp.open_maps')}
                      </a>
                    </td>
                    <td>
                      <form action={decideMatch.bind(null, searchRow.id, 'use', back, hit.id)}>
                        <button className="a-btn small" type="submit">
                          {t('gp.use_this')}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </div>
      ) : null}

      <h2>{t('gp.review_title')}</h2>
      <nav className="a-row" aria-label={t('gp.review_title')}>
        {TABS.map((one) => (
          <Link
            key={one}
            className={one === tab ? 'a-btn small' : 'a-btn ghost small'}
            href={tabHref(one)}
            aria-current={one === tab ? 'page' : undefined}
          >
            {t(`gp.tab_${one}`)} ({counts[one] ?? 0})
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <Empty>—</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('gp.col_ours')}</th>
              <th>{t('gp.col_google')}</th>
              <th>{t('gp.col_score')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const summary = summaries.get(row.id)
              const distance =
                summary && summary.lat !== null && summary.lon !== null
                  ? Math.round(haversineMeters(row, { lat: summary.lat, lon: summary.lon }))
                  : null
              return (
                <tr key={row.id} data-testid="gp-row">
                  <td>
                    <Link href={adminHref(`/places/${row.id}`)}>
                      {pick(row.name, 'en', row.slug)}
                    </Link>
                    <div className="a-muted">
                      {row.regionKey ? pick(row.regionLabel, 'en', row.regionKey) : '—'} ·{' '}
                      <span className="a-mono">
                        {row.lat.toFixed(5)}, {row.lon.toFixed(5)}
                      </span>
                    </div>
                  </td>
                  <td>
                    {row.googlePlaceId === null ? (
                      <span className="a-muted">{t('gp.no_candidate')}</span>
                    ) : summary ? (
                      <>
                        <b>{summary.name}</b>
                        <div className="a-muted">{summary.address}</div>
                        {distance !== null ? (
                          <Pill tone={distance <= 150 ? 'good' : distance <= 500 ? 'warn' : 'bad'}>
                            {t('gp.distance', { m: distance })}
                          </Pill>
                        ) : null}{' '}
                        <a
                          href={summary.mapsUri ?? mapsLink(row.googlePlaceId)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('gp.open_maps')}
                        </a>
                      </>
                    ) : (
                      <>
                        {tab === 'review' && enabled ? (
                          <div className="a-muted">{t('gp.candidate_unavailable')}</div>
                        ) : null}
                        <a
                          href={mapsLink(row.googlePlaceId)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {t('gp.open_maps')}
                        </a>
                      </>
                    )}
                  </td>
                  <td className="a-mono">{row.score === null ? '—' : row.score.toFixed(2)}</td>
                  <td>
                    <div className="a-actions">
                      {row.googlePlaceId && (tab === 'review' || tab === 'rejected') ? (
                        <form action={decideMatch.bind(null, row.id, 'accept', back, undefined)}>
                          <button className="a-btn small" type="submit">
                            {t('gp.accept')}
                          </button>
                        </form>
                      ) : null}
                      {tab === 'review' || tab === 'auto' ? (
                        <form action={decideMatch.bind(null, row.id, 'reject', back, undefined)}>
                          <button className="a-btn ghost small" type="submit">
                            {t('gp.reject')}
                          </button>
                        </form>
                      ) : null}
                      {tab === 'confirmed' ? (
                        <form action={decideMatch.bind(null, row.id, 'unlink', back, undefined)}>
                          <button className="a-btn ghost small" type="submit">
                            {t('gp.unlink')}
                          </button>
                        </form>
                      ) : null}
                      {enabled ? (
                        <Link
                          className="a-btn ghost small"
                          href={`${PAGE}?tab=${tab}&page=${page}&search=${row.id}`}
                        >
                          {t('gp.search_again')}
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
      <Pager
        basePath={PAGE}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRow?.n ?? 0}
      />

      <h2>{t('gp.usage_title')}</h2>
      <p className="a-muted">{t('gp.usage_hint', { cap: dailyCap().billable })}</p>
      <p data-testid="gp-usage-month">
        {t('gp.usage_month', {
          billable: billableOf(monthTotals),
          photos: monthTotals.photo_media ?? 0,
          search: monthTotals.text_search ?? 0,
          details: monthTotals.details_pro ?? 0,
          free: monthTotals.details_photos ?? 0,
        })}
      </p>
      {byDay.size === 0 ? (
        <Empty>{t('gp.usage_empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('gp.col_day')}</th>
              {KINDS.map((kind) => (
                <th key={kind}>{t(`gp.kind_${kind}`)}</th>
              ))}
              <th>{t('gp.col_total')}</th>
            </tr>
          </thead>
          <tbody>
            {[...byDay.entries()].map(([day, rec]) => (
              <tr key={day}>
                <td className="a-mono">{day}</td>
                {KINDS.map((kind) => (
                  <td key={kind}>{rec[kind] ?? 0}</td>
                ))}
                <td>
                  <b>{billableOf(rec)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
