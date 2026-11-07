import Link from 'next/link'

import { adminHref } from '../../_lib/admin-path'
import { ARCHIVE_REGISTRY, listArchived } from '../../_lib/archive'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, When } from '../../_ui/table'
import { restoreFromArchive } from './actions'

export const dynamic = 'force-dynamic'

/** «المحذوفات»: archived catalogue records, newest first, each restorable. */
export default async function ArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const params = await searchParams
  const rows = await listArchived()

  return (
    <>
      <PageHead title={t('arc.title')} description={t('arc.description')} />
      <Flash searchParams={params} />
      {rows.length === 0 ? (
        <Empty>{t('arc.empty')}</Empty>
      ) : (
        <div className="a-card a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>{t('arc.col_kind')}</th>
                <th>{t('arc.col_name')}</th>
                <th>{t('arc.col_when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.kind}-${row.id}`}>
                  <td>{t(`arc.kind_${row.kind}`)}</td>
                  <td>
                    <Link href={adminHref(`/${ARCHIVE_REGISTRY[row.kind].section}/${row.id}`)}>
                      {row.label || row.id}
                    </Link>
                  </td>
                  <td>
                    <When value={row.deletedAt} />
                  </td>
                  <td>
                    <form action={restoreFromArchive} className="a-inline-form">
                      <input type="hidden" name="kind" value={row.kind} />
                      <input type="hidden" name="id" value={row.id} />
                      <button className="a-btn small" type="submit">
                        {t('arc.restore')}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
