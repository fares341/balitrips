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
import { getAdminI18n } from '../../_lib/i18n'
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
  const { t, intl, locale } = await getAdminI18n()
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
        title={t('packages.title')}
        description={t('packages.list_description')}
        actions={
          can(session.role, 'content.write') ? (
            <Link className="a-btn" href={adminHref('/packages/new')}>
              {t('packages.new')}
            </Link>
          ) : null
        }
      />
      <Flash searchParams={params} />

      <form className="a-row a-card" method="get" action={LIST}>
        <div className="a-field">
          <label htmlFor="q">{t('common.search')}</label>
          <input className="a-input" id="q" name="q" defaultValue={q ?? ''} />
        </div>
        <div className="a-field">
          <label htmlFor="status">{t('common.status')}</label>
          <select className="a-select" id="status" name="status" defaultValue={status ?? ''}>
            <option value="">{t('common.all')}</option>
            <option value="draft">{t('common.draft')}</option>
            <option value="published">{t('common.published')}</option>
          </select>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('common.filter')}
          </button>
          <Link className="a-btn ghost" href={LIST}>
            {t('common.clear')}
          </Link>
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty>{t('packages.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('common.name')}</th>
              <th>{t('common.status')}</th>
              <th>{t('packages.pricing')}</th>
              <th className="num">{t('packages.days')}</th>
              <th className="num">{t('packages.max_guests')}</th>
              <th className="num">{t('common.price')}</th>
              <th>{t('common.updated')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={adminHref(`/packages/${row.id}`)}>
                    {pick(row.name, locale, row.slug)}
                  </Link>
                  <div className="a-mono a-muted">{row.slug}</div>
                </td>
                <td>
                  <PublishPill status={row.status} />
                </td>
                <td>
                  <Pill tone={row.pricingMode === 'per_guest' ? 'info' : 'neutral'}>
                    {row.pricingMode === 'per_guest' ? t('packages.per_guest') : t('packages.flat')}
                  </Pill>
                  {row.driverIncluded ? <Pill tone="good">{t('packages.driver_pill')}</Pill> : null}
                </td>
                <td className="num">{row.days}</td>
                <td className="num">{row.maxGuests}</td>
                <td className="num">{formatMoney(row.priceMinor, row.currency, intl)}</td>
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
                        {row.status === 'published'
                          ? t('packages.unpublish')
                          : t('packages.publish')}
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
