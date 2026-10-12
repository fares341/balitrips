import { and, asc, count, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { mapPlaces, regions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, PublishPill, Table } from '../../_ui/table'
import { setPlaceFree } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 30
const LIST = adminHref('/places')

export default async function PlacesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const access = param(params, 'access')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(mapPlaces.deletedAt)]
  if (q) {
    const like = `%${q}%`
    const match = or(ilike(mapPlaces.slug, like), sql`${mapPlaces.name} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }
  if (access === 'free') filters.push(eq(mapPlaces.isFree, true))
  if (access === 'locked') filters.push(eq(mapPlaces.isFree, false))

  const where = and(...filters)

  const [rows, [totalRow], [freeRow]] = await Promise.all([
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        category: mapPlaces.category,
        lat: mapPlaces.lat,
        lon: mapPlaces.lon,
        isFree: mapPlaces.isFree,
        requiredEntitlement: mapPlaces.requiredEntitlement,
        status: mapPlaces.status,
        regionKey: regions.key,
        regionLabel: regions.label,
      })
      .from(mapPlaces)
      .leftJoin(regions, eq(regions.id, mapPlaces.regionId))
      .where(where)
      .orderBy(asc(mapPlaces.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(mapPlaces).where(where),
    db
      .select({ value: count() })
      .from(mapPlaces)
      .where(and(isNull(mapPlaces.deletedAt), eq(mapPlaces.isFree, true))),
  ])

  return (
    <>
      <PageHead
        title="Map places"
        description={`${freeRow?.value ?? 0} place(s) are free to view. Everything else is redacted server-side for unentitled visitors — not blurred in CSS.`}
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/places/new')}>
              New place
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="access">Access</label>
          <select className="a-select" id="access" name="access" defaultValue={access ?? ''}>
            <option value="">Any</option>
            <option value="free">Free</option>
            <option value="locked">Requires entitlement</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            Filter
          </button>
          <Link className="a-btn ghost" href={LIST}>
            Reset
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>No places match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Region</th>
              <th>Coordinates</th>
              <th>Access</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/places/${row.id}`)}>
                    {pick(row.name, 'en', row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>{pick(row.category, 'en') || <span className="a-muted">—</span>}</td>
                <td>
                  {row.regionKey ? (
                    pick(row.regionLabel, 'en', row.regionKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td className="a-mono">
                  {row.lat.toFixed(5)}, {row.lon.toFixed(5)}
                </td>
                <td>
                  {row.isFree ? (
                    <Pill tone="good">free</Pill>
                  ) : (
                    <Pill tone="warn">{row.requiredEntitlement}</Pill>
                  )}
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td>
                  {can(session.role, 'content.write') ? (
                    <form
                      className="a-inline-form"
                      action={setPlaceFree.bind(null, row.id, !row.isFree)}
                    >
                      <button className="a-btn ghost small" type="submit">
                        {row.isFree ? 'Lock' : 'Make free'}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager
        basePath={LIST}
        searchParams={params}
        page={page}
        pageSize={PAGE_SIZE}
        total={totalRow?.value ?? 0}
      />
    </>
  )
}
