import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { itineraries, itineraryDays } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, PublishPill, Table, When } from '../../_ui/table'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/itineraries')

export default async function ItinerariesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(itineraries.deletedAt)]

  if (q) {
    const like = `%${q}%`
    const match = or(ilike(itineraries.slug, like), sql`${itineraries.name} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') {
    filters.push(eq(itineraries.status, status))
  }

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        id: itineraries.id,
        slug: itineraries.slug,
        name: itineraries.name,
        status: itineraries.status,
        days: itineraries.days,
        version: itineraries.version,
        priceMinor: itineraries.priceMinor,
        currency: itineraries.currency,
        updatedAt: itineraries.updatedAt,
      })
      .from(itineraries)
      .where(where)
      .orderBy(desc(itineraries.updatedAt), asc(itineraries.slug))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(itineraries).where(where),
  ])

  const total = totalRow?.value ?? 0

  /**
   * How many days are actually authored, per row on this page.
   *
   * Counted in its own grouped query rather than a correlated subquery: the
   * stored `days` column and the real row count disagreeing is the exact
   * defect this screen exists to surface, so the number beside it has to be
   * one nobody has to squint at.
   */
  const authoredByItinerary = new Map<string, number>()
  if (rows.length > 0) {
    const counts = await db
      .select({ itineraryId: itineraryDays.itineraryId, value: count() })
      .from(itineraryDays)
      .where(
        inArray(
          itineraryDays.itineraryId,
          rows.map((row) => row.id),
        ),
      )
      .groupBy(itineraryDays.itineraryId)

    for (const row of counts) authoredByItinerary.set(row.itineraryId, row.value)
  }

  return (
    <>
      <PageHead
        title="Itineraries"
        description="Day plans are authored row by row. The length column is the number of days that actually exist — never a number the renderer has to pad with filler."
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/itineraries/new')}>
              New itinerary
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">Search</label>
          <input
            className="a-input"
            id="q"
            name="q"
            defaultValue={q ?? ''}
            placeholder="Name or slug"
          />
        </div>
        <div className="a-field">
          <label htmlFor="status">Status</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">Any</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
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
        <Empty>No itineraries match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th className="num">Days</th>
              <th className="num">Version</th>
              <th className="num">Price</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const authoredDays = authoredByItinerary.get(row.id) ?? 0
              return (
                <tr key={row.id}>
                  <td>
                    <Link href={adminHref(`/itineraries/${row.id}`)}>
                      {pick(row.name, 'en', row.slug)}
                    </Link>
                    <div className="a-mono a-muted">{row.slug}</div>
                  </td>
                  <td>
                    <PublishPill status={row.status} />
                  </td>
                  <td className="num">
                    {authoredDays}
                    {authoredDays !== row.days ? (
                      <>
                        {' '}
                        <Pill tone="warn">stored {row.days}</Pill>
                      </>
                    ) : null}
                  </td>
                  <td className="num">v{row.version}</td>
                  <td className="num">{formatMoney(row.priceMinor, row.currency, 'en')}</td>
                  <td>
                    <When value={row.updatedAt} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
