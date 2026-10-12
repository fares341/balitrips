import { and, count, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { packages } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { pageParam, param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pager, Pill, PublishPill, Table, When } from '../../_ui/table'
import { setPackageStatus } from './actions'

export const dynamic = 'force-dynamic'

const PAGE_SIZE = 25
const LIST = adminHref('/packages')

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const params = await searchParams

  const q = param(params, 'q')
  const status = param(params, 'status')
  const page = pageParam(params)

  const filters: SQL[] = [isNull(packages.deletedAt)]
  if (q) {
    const like = `%${q}%`
    const match = or(ilike(packages.slug, like), sql`${packages.name} ->> 'en' ilike ${like}`)
    if (match) filters.push(match)
  }
  if (status === 'draft' || status === 'published') filters.push(eq(packages.status, status))

  const where = and(...filters)

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(packages)
      .where(where)
      .orderBy(desc(packages.updatedAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ value: count() }).from(packages).where(where),
  ])

  return (
    <>
      <PageHead
        title="Packages"
        description="Pricing mode is explicit: flat charges the price as-is, per guest multiplies it."
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/packages/new')}>
              New package
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
        <Empty>No packages match those filters.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Pricing</th>
              <th className="num">Days</th>
              <th className="num">Max guests</th>
              <th className="num">Price</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/packages/${row.id}`)}>
                    {pick(row.name, 'en', row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td>
                  <Pill tone={row.pricingMode === 'per_guest' ? 'info' : 'neutral'}>
                    {row.pricingMode === 'per_guest' ? 'per guest' : 'flat'}
                  </Pill>
                  {row.driverIncluded ? <Pill tone="good">driver</Pill> : null}
                </td>
                <td className="num">{row.days}</td>
                <td className="num">{row.maxGuests}</td>
                <td className="num">{formatMoney(row.priceMinor, row.currency, 'en')}</td>
                <td>
                  <When value={row.updatedAt} />
                </td>
                <td>
                  {can(session.role, 'content.publish') ? (
                    <form
                      className="a-inline-form"
                      action={setPackageStatus.bind(
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
