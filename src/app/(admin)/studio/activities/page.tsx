import { and, asc, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, regions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, PublishPill, Table, When } from '../../_ui/table'
import { setActivityStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/activities')

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const regionId = param(params, 'region')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(activities.deletedAt)]

  if (q) {
    // Search the authoring locale and the slug. Matching every locale would
    // need a jsonb path per locale; English plus slug is what operators use.
    const like = `%${q}%`
    const match = or(
      ilike(activities.slug, like),
      sql`${activities.name} ->> 'en' ilike ${like}`,
      sql`${activities.area} ->> 'en' ilike ${like}`,
    )
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') {
    filters.push(eq(activities.status, status))
  }
  if (regionId) filters.push(eq(activities.regionId, regionId))

  const where = and(...filters)

  const [rows, [totalRow], regionRows] = await Promise.all([
    db
      .select({
        id: activities.id,
        slug: activities.slug,
        name: activities.name,
        status: activities.status,
        priceMinor: activities.priceMinor,
        currency: activities.currency,
        maxGuests: activities.maxGuests,
        leadTimeHours: activities.leadTimeHours,
        updatedAt: activities.updatedAt,
        regionLabel: regions.label,
        regionKey: regions.key,
      })
      .from(activities)
      .leftJoin(regions, eq(regions.id, activities.regionId))
      .where(where)
      .orderBy(asc(activities.sortOrder), desc(activities.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(activities).where(where),
    db
      .select({ id: regions.id, key: regions.key, label: regions.label })
      .from(regions)
      .orderBy(asc(regions.sortOrder)),
  ])

  const total = totalRow?.value ?? 0
  const mayPublish = can(session.role, 'content.publish')
  const mayWrite = can(session.role, 'content.write')

  return (
    <>
      <PageHead
        title="Activities"
        description="Per-activity inclusions, FAQ, time slots and lead time — not one shared list across every tour."
        actions={
          mayWrite ? (
            <Link className="a-btn" href={adminHref('/activities/new')}>
              New activity
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
            placeholder="Name, area or slug"
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
        <div className="a-field">
          <label htmlFor="region">Region</label>
          <select className="a-select" id="region" name="region" defaultValue={regionId ?? ''}>
            <option value="">Any</option>
            {regionRows.map((region) => (
              <option key={region.id} value={region.id}>
                {pick(region.label, 'en', region.key)}
              </option>
            ))}
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
        <Empty>No activities match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Region</th>
              <th>Status</th>
              <th className="num">Price</th>
              <th className="num">Max guests</th>
              <th className="num">Lead time</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/activities/${row.id}`)}>
                    {pick(row.name, 'en', row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>
                  {row.regionKey ? (
                    pick(row.regionLabel, 'en', row.regionKey)
                  ) : (
                    <span className="a-muted">—</span>
                  )}
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td className="num">{formatMoney(row.priceMinor, row.currency, 'en')}</td>
                <td className="num">{row.maxGuests}</td>
                <td className="num">{row.leadTimeHours}h</td>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td>
                  {mayPublish ? (
                    <form
                      className="a-inline-form"
                      action={setActivityStatus.bind(
                        null,
                        row.id,
                        row.status === 'published' ? 'draft' : 'published',
                      )}
                    >
                      <button className="a-btn ghost small" type="submit">
                        {row.status === 'published' ? 'Unpublish' : 'Publish'}
                      </button>
                    </form>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Pager basePath={LIST} searchParams={params} page={page} pageSize={PAGE_SIZE} total={total} />
    </>
  )
}
