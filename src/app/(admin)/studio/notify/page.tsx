import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog } from '@/db/schema'

import { requireCapability } from '../../_lib/session'
import { Field } from '../../_ui/field'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Table, When } from '../../_ui/table'
import { sendAdminNotification } from './actions'

export const dynamic = 'force-dynamic'

/** إرسال إشعار يدوي لعميل أو لكل العملاء أو لأصحاب الباقات (الوثيقة 2.5). */
export default async function NotifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('roles.write')
  const params = await searchParams

  const history = await db
    .select({ id: auditLog.id, after: auditLog.after, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'notification.send')))
    .orderBy(desc(auditLog.createdAt))
    .limit(20)

  return (
    <>
      <PageHead
        title="Send a notification"
        description="Always delivered in the site (the bell and Account → Notifications). E-mail and WhatsApp are optional; WhatsApp only reaches customers who opted in, through the approved bali_admin_message template ({{1}} = the message)."
      />
      <Flash searchParams={params} />

      <form className="a-card a-form" action={sendAdminNotification}>
        <div className="a-row">
          <Field label="Send to" htmlFor="audience">
            <select className="a-select" id="audience" name="audience" defaultValue="user">
              <option value="user">One customer (by e-mail)</option>
              <option value="plan_holders">Everyone with an active plan</option>
              <option value="customers">All active customers</option>
            </select>
          </Field>
          <Field label="Customer e-mail" htmlFor="email_address" hint="Only for “One customer”.">
            <input className="a-input" id="email_address" name="email_address" type="email" />
          </Field>
        </div>
        <Field label="Title" htmlFor="title" hint="Up to 120 characters.">
          <input className="a-input" id="title" name="title" maxLength={120} required />
        </Field>
        <Field label="Message" htmlFor="body" hint="Up to 1000 characters.">
          <textarea className="a-input" id="body" name="body" rows={5} maxLength={1000} required />
        </Field>
        <Field label="Link inside the site (optional)" htmlFor="href" hint="e.g. /plans or /map">
          <input className="a-input" id="href" name="href" placeholder="/plans" />
        </Field>
        <div className="a-row">
          <label className="a-check">
            <input type="checkbox" name="email" /> Also send by e-mail
          </label>
          <label className="a-check">
            <input type="checkbox" name="whatsapp" /> Also send on WhatsApp (opted-in only)
          </label>
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            Send
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>Recently sent</h2>
        {history.length === 0 ? (
          <Empty>Nothing sent yet.</Empty>
        ) : (
          <Table>
            <tbody>
              {history.map((row) => {
                const after = (row.after ?? {}) as Record<string, unknown>
                return (
                  <tr key={row.id}>
                    <td>
                      <When value={row.createdAt} />
                    </td>
                    <td>{String(after.title ?? '')}</td>
                    <td>{String(after.audience ?? '')}</td>
                    <td className="num">{String(after.sent ?? '')}</td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
