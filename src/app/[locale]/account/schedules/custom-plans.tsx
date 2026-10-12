/**
 * طلبات الجداول المخصصة لهذا المستخدم: الحالة، وآخر نسخة PDF غير مسحوبة.
 * الأزرار تمر بنفس التسليم المحمي (علامة مائية، جهاز، حظر، سياسة التحميل).
 */

import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { getFormatter, getTranslations } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'
import { db } from '@/db'
import { customTripDocuments, customTripRequests } from '@/db/schema'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { formatMoney } from '@/lib/money'

import { payCustomQuote } from '../../custom/actions'

export async function CustomPlans({
  userId,
  locale,
  downloadsAllowed,
}: {
  userId: string
  locale: Locale
  downloadsAllowed: boolean
}) {
  const [t, format] = await Promise.all([getTranslations({ locale }), getFormatter({ locale })])
  const requests = await db
    .select()
    .from(customTripRequests)
    .where(eq(customTripRequests.userId, userId))
    .orderBy(desc(customTripRequests.createdAt))
    .limit(20)
  if (requests.length === 0) return null

  const docs = await db
    .select()
    .from(customTripDocuments)
    .where(
      and(
        isNull(customTripDocuments.withdrawnAt),
        inArray(
          customTripDocuments.requestId,
          requests.map((request) => request.id),
        ),
      ),
    )
    .orderBy(desc(customTripDocuments.version))
  const latest = new Map<string, (typeof docs)[number]>()
  for (const doc of docs) if (!latest.has(doc.requestId)) latest.set(doc.requestId, doc)

  return (
    <section aria-labelledby="bt-acct-custom-h" style={{ marginTop: 32 }}>
      <h2 id="bt-acct-custom-h" style={{ fontSize: 20 }}>
        {t('acct_custom_t')}
      </h2>
      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        {requests.map((request) => {
          const doc = latest.get(request.id)
          const statusKey = `cstatus_${request.status}`
          // الوثيقة 13.1: عرض سعر قابل للدفع — مسعَّر، غير مدفوع، والطلب غير مغلق.
          const quoted =
            request.quoteMinor !== null && request.quoteMinor > 0 && request.quoteCurrency !== null
          const paid = request.paidOrderId !== null
          const closed = request.status === 'cancelled' || request.status === 'completed'
          return (
            <article key={request.id} className="card" style={{ padding: 16 }}>
              <div
                className="row"
                style={{ justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}
              >
                <div>
                  <strong>
                    {request.travellers ?? '—'} <Icon name="users" size={14} /> ·{' '}
                    {request.startDate ??
                      format.dateTime(request.createdAt, { dateStyle: 'medium' })}
                  </strong>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t('acct_custom_status')}:{' '}
                    {t.has(statusKey as never) ? t(statusKey as never) : request.status}
                  </div>
                  {quoted && request.quoteMinor !== null && request.quoteCurrency !== null && (
                    <div style={{ fontSize: 13.5, marginTop: 4 }}>
                      {t('acct_custom_quote')}:{' '}
                      <strong>
                        {formatMoney(request.quoteMinor, request.quoteCurrency, locale)}
                      </strong>
                      {paid && <span className="muted"> · {t('acct_custom_paid')}</span>}
                    </div>
                  )}
                </div>
                {quoted && !paid && !closed && (
                  <form action={payCustomQuote}>
                    <input type="hidden" name="requestId" value={request.id} />
                    <button type="submit" className="btn btn-orange" style={{ minHeight: 40 }}>
                      <Icon name="lock" size={15} color="#fff" /> {t('acct_custom_pay')}
                    </button>
                  </form>
                )}
                {doc && (
                  <div className="row" style={{ gap: 8 }}>
                    <LinkButton href={`/account/custom/${doc.id}/view`} variant="orange" size="sm">
                      {t('acct_sched_view')}
                    </LinkButton>
                    {downloadsAllowed && (
                      <a
                        className="btn btn-ghost"
                        href={getPathname({ href: `/account/custom/${doc.id}/download`, locale })}
                        download
                        style={{ minHeight: 40, fontSize: 13.5 }}
                      >
                        <Icon name="pdf" size={15} /> {t('acct_sched_dl')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
