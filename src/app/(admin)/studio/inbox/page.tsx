import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { notifications } from '@/db/schema'
import { translator } from '@/lib/email'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { markStaffInboxRead } from './actions'

export const dynamic = 'force-dynamic'

/** صندوق الفريق: طلبات جديدة، مدفوعات، رسائل تواصل، تنبيهات أمنية. */
export default async function InboxPage() {
  await requireCapability('admin.access')
  const rows = await db
    .select()
    .from(notifications)
    .where(eq(notifications.audience, 'staff'))
    .orderBy(desc(notifications.createdAt))
    .limit(200)

  const { t, locale } = await getAdminI18n()
  // نص الإشعار نفسه من قاموس البريد/الموقع، بلغة الاستوديو الحالية.
  const notif = translator(locale) as unknown as (
    key: string,
    params?: Record<string, string | number>,
  ) => string
  const safe = (key: string, params: Record<string, string | number>) => {
    try {
      return notif(key, params)
    } catch {
      return key
    }
  }
  const unread = rows.filter((row) => row.readAt === null).length

  return (
    <>
      <PageHead
        title={t('inbox.title')}
        description={t('inbox.description')}
        actions={
          unread > 0 ? (
            <form action={markStaffInboxRead}>
              <button className="a-btn ghost" type="submit">
                {t('inbox.mark_read', { count: unread })}
              </button>
            </form>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <Empty>{t('inbox.empty')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('inbox.col_when')}</th>
              <th>{t('inbox.col_what')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const params = row.params ?? {}
              return (
                <tr key={row.id}>
                  <td>
                    <When value={row.createdAt} />
                    {row.readAt === null ? (
                      <div>
                        <Pill tone="warn">{t('inbox.new')}</Pill>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <strong>{safe(`notif_${row.type}_t`, params)}</strong>
                    <div className="a-hint">{safe(`notif_${row.type}_b`, params)}</div>
                  </td>
                  <td>
                    {row.href ? <Link href={adminHref(row.href)}>{t('inbox.open')}</Link> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
