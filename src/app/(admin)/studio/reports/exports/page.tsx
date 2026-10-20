import { and, desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { reportExports } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { isReportId } from '@/lib/reports/catalog'

import { adminHref } from '../../../_lib/admin-path'
import { requireCapability } from '../../../_lib/session'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table, When } from '../../../_ui/table'
import { buildContext } from '../access'

export const dynamic = 'force-dynamic'

/** PDF exports: queued by "Download PDF" on a report, rendered by the worker. */
export default async function ExportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('orders.read')
  const query = await searchParams
  const { t } = await buildContext(session.role)
  const admin = can(session.role, 'roles.write')
  const rows = await db
    .select()
    .from(reportExports)
    .where(admin ? undefined : and(eq(reportExports.requestedBy, session.userId)))
    .orderBy(desc(reportExports.createdAt))
    .limit(50)

  return (
    <>
      <PageHead
        title={t('rp.exports_title')}
        description={t('rp.exports_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/reports')}>
            {t('rp.back_to_reports')}
          </Link>
        }
      />
      <Flash searchParams={query} />
      <section className="a-card">
        {rows.length === 0 ? (
          <Empty>{t('rp.exports_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('rp.col_report')}</th>
                <th>{t('rp.period')}</th>
                <th>{t('common.status')}</th>
                <th>{t('rp.col_when')}</th>
                <th>{t('rp.col_file')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{isReportId(row.report) ? t(`rp.r_${row.report}`) : row.report}</td>
                  <td dir="ltr">
                    {row.params.period === 'custom'
                      ? `${row.params.from ?? ''} – ${row.params.to ?? ''}`
                      : t(`rp.preset_${row.params.period ?? '30d'}`)}
                  </td>
                  <td>
                    <Pill
                      tone={
                        row.status === 'ready' ? 'good' : row.status === 'failed' ? 'bad' : 'warn'
                      }
                    >
                      {t(`rp.export_${row.status}`)}
                    </Pill>
                  </td>
                  <td>
                    <When value={row.createdAt} />
                  </td>
                  <td>
                    {row.status === 'ready' ? (
                      <a href={adminHref(`/reports/exports/${row.id}`)}>{t('rp.download')}</a>
                    ) : row.status === 'failed' ? (
                      <span className="a-muted">{t('rp.export_failed_hint')}</span>
                    ) : (
                      <span className="a-muted">{t('rp.export_wait_hint')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </>
  )
}
