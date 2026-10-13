import { and, desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { auditLog } from '@/db/schema'

import { getAdminI18n } from '../../_lib/i18n'
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
  const { t, intl } = await getAdminI18n()

  const history = await db
    .select({ id: auditLog.id, after: auditLog.after, createdAt: auditLog.createdAt })
    .from(auditLog)
    .where(and(eq(auditLog.action, 'notification.send')))
    .orderBy(desc(auditLog.createdAt))
    .limit(20)

  return (
    <>
      <PageHead title={t('notify.title')} description={t('notify.description')} />
      <Flash searchParams={params} />

      <form className="a-card a-form" action={sendAdminNotification}>
        <div className="a-row">
          <Field label={t('notify.send_to')} htmlFor="audience">
            <select className="a-select" id="audience" name="audience" defaultValue="user">
              <option value="user">{t('notify.audience_user')}</option>
              <option value="plan_holders">{t('notify.audience_plan_holders')}</option>
              <option value="customers">{t('notify.audience_customers')}</option>
            </select>
          </Field>
          <Field
            label={t('notify.customer_email')}
            htmlFor="email_address"
            hint={t('notify.customer_email_hint')}
          >
            <input className="a-input" id="email_address" name="email_address" type="email" />
          </Field>
        </div>
        <Field label={t('notify.title_label')} htmlFor="title" hint={t('notify.title_hint')}>
          <input className="a-input" id="title" name="title" maxLength={120} required />
        </Field>
        <Field label={t('notify.message')} htmlFor="body" hint={t('notify.message_hint')}>
          <textarea className="a-input" id="body" name="body" rows={5} maxLength={1000} required />
        </Field>
        <Field label={t('notify.link')} htmlFor="href" hint={t('notify.link_hint')}>
          <input className="a-input" id="href" name="href" placeholder="/plans" />
        </Field>
        <div className="a-row">
          <label className="a-check">
            <input type="checkbox" name="email" /> {t('notify.also_email')}
          </label>
          <label className="a-check">
            <input type="checkbox" name="whatsapp" /> {t('notify.also_whatsapp')}
          </label>
        </div>
        <div className="a-actions">
          <button className="a-btn accent" type="submit">
            {t('notify.send')}
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('notify.recent')}</h2>
        {history.length === 0 ? (
          <Empty>{t('notify.empty')}</Empty>
        ) : (
          <Table>
            <tbody>
              {history.map((row) => {
                const after = (row.after ?? {}) as Record<string, unknown>
                const audience = String(after.audience ?? '')
                const audienceKey = `notify.audience_${audience}`
                return (
                  <tr key={row.id}>
                    <td>
                      <When value={row.createdAt} />
                    </td>
                    <td>{String(after.title ?? '')}</td>
                    <td>{t(audienceKey) === audienceKey ? audience : t(audienceKey)}</td>
                    <td className="num">
                      {typeof after.sent === 'number'
                        ? new Intl.NumberFormat(intl).format(after.sent)
                        : String(after.sent ?? '')}
                    </td>
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
