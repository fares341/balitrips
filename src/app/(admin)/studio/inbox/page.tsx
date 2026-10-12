import { desc, eq } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { notifications } from '@/db/schema'
import { translator } from '@/lib/email'

import { adminHref } from '../../_lib/admin-path'
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

  const t = translator('en') as unknown as (
    key: string,
    params?: Record<string, string | number>,
  ) => string
  const safe = (key: string, params: Record<string, string | number>) => {
    try {
      return t(key, params)
    } catch {
      return key
    }
  }
  const unread = rows.filter((row) => row.readAt === null).length

  return (
    <>
      <PageHead
        title="Inbox"
        description="Team notifications. Also e-mailed to STAFF_ALERT_EMAILS (or every admin) and, for urgent types, sent to STAFF_WHATSAPP_NUMBER."
        actions={
          unread > 0 ? (
            <form action={markStaffInboxRead}>
              <button className="a-btn ghost" type="submit">
                Mark {unread} as read
              </button>
            </form>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <Empty>Nothing yet.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>When</th>
              <th>What</th>
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
                        <Pill tone="warn">new</Pill>
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <strong>{safe(`notif_${row.type}_t`, params)}</strong>
                    <div className="a-hint">{safe(`notif_${row.type}_b`, params)}</div>
                  </td>
                  <td>{row.href ? <Link href={adminHref(row.href)}>Open →</Link> : null}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      )}
    </>
  )
}
