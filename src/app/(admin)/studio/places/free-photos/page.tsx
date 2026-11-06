import { and, asc, count, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { mapPlaces, placePhotoCandidates } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { freePhotoProgress, loadOwnPhotos, unsplashKey } from '@/lib/free-photos/job'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { buildQuery, pageParam, param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pager, Pill } from '../../../_ui/table'
import { decideCandidate, replaceSharedPhotos } from './actions'
import { FindPanel } from './find-panel'
import { ConfirmSubmit } from '../../../_ui/confirm-submit'

export const dynamic = 'force-dynamic'

const PAGE = adminHref('/places/free-photos')
const PAGE_SIZE = 12
const TABS = ['review', 'auto', 'applied', 'none'] as const
type Tab = (typeof TABS)[number]

const C = placePhotoCandidates
const has = (cond: ReturnType<typeof sql>) =>
  sql`exists (select 1 from ${C} where ${C.placeId} = ${mapPlaces.id} and ${cond})`

function tabWhere(tab: Tab) {
  const applied = has(sql`${C.status} = 'applied'`)
  if (tab === 'review') return and(has(sql`${C.status} = 'new'`), sql`not ${applied}`)
  if (tab === 'auto') return has(sql`${C.status} = 'applied' and ${C.autoApplied}`)
  if (tab === 'applied') return applied
  return and(
    isNotNull(mapPlaces.freePhotosCheckedAt),
    sql`not ${has(sql`${C.status} in ('new','applied')`)}`,
  )
}

export default async function FreePhotosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const rawTab = param(params, 'tab')
  const tab: Tab = (TABS as readonly string[]).includes(rawTab ?? '') ? (rawTab as Tab) : 'review'
  const page = pageParam(params)
  const back = `${PAGE}${buildQuery(params, {})}`
  const live = isNull(mapPlaces.deletedAt)

  const [tabCounts, [totals], [appliedRow], places, own] = await Promise.all([
    Promise.all(
      TABS.map(async (one) => {
        const [row] = await db
          .select({ n: count() })
          .from(mapPlaces)
          .where(and(live, tabWhere(one)))
        return [one, row?.n ?? 0] as const
      }),
    ),
    db
      .select({
        total: count(),
        checked: sql<number>`count(${mapPlaces.freePhotosCheckedAt})::int`,
        withCands: sql<number>`count(*) filter (where ${has(sql`true`)})::int`,
      })
      .from(mapPlaces)
      .where(live),
    db
      .select({
        applied: count(),
        auto: sql<number>`count(*) filter (where ${C.autoApplied})::int`,
      })
      .from(C)
      .where(sql`${C.status} = 'applied'`),
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        heroId: mapPlaces.heroImageId,
        gallery: mapPlaces.galleryImageIds,
      })
      .from(mapPlaces)
      .where(and(live, tabWhere(tab)))
      .orderBy(asc(mapPlaces.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    loadOwnPhotos(),
  ])
  const counts = Object.fromEntries(tabCounts)
  const candidates =
    places.length === 0
      ? []
      : await db
          .select()
          .from(C)
          .where(
            and(
              inArray(
                C.placeId,
                places.map((p) => p.id),
              ),
              sql`${C.status} <> 'rejected'`,
            ),
          )
          .orderBy(
            sql`case ${C.status} when 'applied' then 0 when 'new' then 1 else 2 end`,
            sql`${C.score} desc`,
          )
  const byPlace = new Map<string, (typeof candidates)[number][]>()
  for (const c of candidates) byPlace.set(c.placeId, [...(byPlace.get(c.placeId) ?? []), c])
  const sharedPlaces = own.rows.filter((r) =>
    [r.heroId, ...r.galleryIds].some((id) => id && own.shared.isShared(id)),
  ).length

  return (
    <>
      <PageHead
        title={t('fp.title')}
        description={t('fp.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/places')}>
            {t('nav.places')}
          </Link>
        }
      />
      <Flash searchParams={params} />
      <p data-testid="fp-counts">
        {t('fp.counts', {
          checked: totals?.checked ?? 0,
          total: totals?.total ?? 0,
          withCands: totals?.withCands ?? 0,
          applied: appliedRow?.applied ?? 0,
          auto: appliedRow?.auto ?? 0,
        })}
      </p>
      <p className="a-muted">{unsplashKey() ? t('fp.unsplash_on') : t('fp.unsplash_off')}</p>

      <FindPanel initial={freePhotoProgress()} />

      <div className="a-card" data-testid="fp-clear">
        <h2 style={{ marginTop: 0 }}>{t('fp.clear_title')}</h2>
        <p className="a-muted">{t('fp.clear_hint', { n: sharedPlaces })}</p>
        <form action={replaceSharedPhotos}>
          <button className="a-btn ghost" type="submit" disabled={sharedPlaces === 0}>
            {t('fp.clear')}
          </button>
        </form>
      </div>

      <nav className="a-row" aria-label={t('fp.title')}>
        {TABS.map((one) => (
          <Link
            key={one}
            className={one === tab ? 'a-btn small' : 'a-btn ghost small'}
            href={`${PAGE}?tab=${one}`}
            aria-current={one === tab ? 'page' : undefined}
          >
            {t(`fp.tab_${one}`)} ({counts[one] ?? 0})
          </Link>
        ))}
      </nav>

      {places.length === 0 ? <Empty>—</Empty> : null}
      {places.map((place) => {
        const row = own.rows.find((r) => r.placeId === place.id)
        const current = !place.heroId
          ? t('fp.current_none')
          : own.shared.isShared(place.heroId)
            ? t('fp.current_shared')
            : t('fp.current_unique')
        const list = (byPlace.get(place.id) ?? []).slice(0, 8)
        return (
          <section key={place.id} className="a-card" data-testid="fp-place">
            <h3 style={{ marginTop: 0 }}>
              <Link href={adminHref(`/places/${place.id}`)}>
                {pick(place.name, 'en', place.slug)}
              </Link>{' '}
              <span className="a-muted" style={{ fontWeight: 400, fontSize: 13 }}>
                {t('fp.current')}: {current}
                {row && row.galleryIds.length > 0 ? ` · +${row.galleryIds.length}` : ''}
              </span>
            </h3>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
              }}
            >
              {list.map((c) => (
                <figure key={c.id} style={{ margin: 0 }} data-testid="fp-candidate">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.thumbUrl}
                    alt={c.title ?? ''}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    style={{
                      width: '100%',
                      aspectRatio: '4 / 3',
                      objectFit: 'cover',
                      borderRadius: 6,
                      background: '#eee',
                    }}
                  />
                  <figcaption style={{ fontSize: 12, lineHeight: 1.45 }}>
                    <Pill tone={c.tier === 'high' ? 'good' : c.tier === 'good' ? 'good' : 'warn'}>
                      {t(`fp.tier_${c.tier}`)} {c.score.toFixed(2)}
                    </Pill>{' '}
                    {c.status === 'duplicate' ? <Pill tone="bad">{t('fp.dup')}</Pill> : null}
                    <div>
                      <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                        {c.source}
                      </a>{' '}
                      ·{' '}
                      {c.licenseUrl ? (
                        <a href={c.licenseUrl} target="_blank" rel="noopener noreferrer">
                          {c.license}
                        </a>
                      ) : (
                        c.license
                      )}
                    </div>
                    <div className="a-muted">{(c.author ?? '—').slice(0, 60)}</div>
                    <div className="a-muted">
                      {c.distanceM !== null ? t('fp.distance', { m: c.distanceM }) : t('fp.no_geo')}{' '}
                      · {t('fp.name', { score: c.nameScore.toFixed(2) })} · {c.width}px
                    </div>
                  </figcaption>
                  <div className="a-actions" style={{ marginTop: 6 }}>
                    {c.status === 'applied' ? (
                      <form action={decideCandidate.bind(null, c.id, 'remove', back)}>
                        <ConfirmSubmit
                          className="a-btn ghost small"
                          label={t('fp.undo')}
                          title={t('confirm.remove_title')}
                        />
                      </form>
                    ) : c.status === 'new' ? (
                      <>
                        <form action={decideCandidate.bind(null, c.id, 'main', back)}>
                          <button className="a-btn small" type="submit">
                            {t('fp.use_main')}
                          </button>
                        </form>
                        <form action={decideCandidate.bind(null, c.id, 'gallery', back)}>
                          <button className="a-btn ghost small" type="submit">
                            {t('fp.add_gallery')}
                          </button>
                        </form>
                        <form action={decideCandidate.bind(null, c.id, 'reject', back)}>
                          <button className="a-btn ghost small" type="submit">
                            {t('fp.reject')}
                          </button>
                        </form>
                      </>
                    ) : null}
                  </div>
                </figure>
              ))}
            </div>
          </section>
        )
      })}
      <Pager
        basePath={PAGE}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={counts[tab] ?? 0}
      />
    </>
  )
}
