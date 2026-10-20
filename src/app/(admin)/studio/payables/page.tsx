import { desc, eq, max, min, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { orderItems, orders, supplierSettlements, suppliers } from '@/db/schema'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { createSettlement, setSettlementStatus } from './actions'
import { payableWhere } from './queries'

export const dynamic = 'force-dynamic'

const TONES: Record<string, 'neutral' | 'good' | 'warn' | 'info'> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'good',
}

/** مستحقات الموردين — what we owe each supplier, and the payments made. */
export default async function PayablesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('suppliers.write')
  const { t, intl } = await getAdminI18n()
  const params = await searchParams

  const [owed, runs] = await Promise.all([
    db
      .select({
        supplierId: orderItems.supplierId,
        supplierName: suppliers.name,
        currency: orderItems.costCurrency,
        lines: sql<number>`count(*)::int`,
        totalMinor: sql<string>`coalesce(sum(${orderItems.costMinor}), 0)::text`,
        firstDay: min(orderItems.travelDate),
        lastDay: max(orderItems.travelDate),
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .innerJoin(suppliers, eq(suppliers.id, orderItems.supplierId))
      .where(payableWhere({}))
      .groupBy(orderItems.supplierId, suppliers.name, orderItems.costCurrency)
      .orderBy(suppliers.name),
    db
      .select({ run: supplierSettlements, supplierName: suppliers.name })
      .from(supplierSettlements)
      .innerJoin(suppliers, eq(suppliers.id, supplierSettlements.supplierId))
      .orderBy(desc(supplierSettlements.createdAt))
      .limit(100),
  ])

  return (
    <>
      <PageHead
        title={t('pay.title')}
        description={t('pay.description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/suppliers')}>
            {t('nav.suppliers')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>{t('pay.owed_title')}</h2>
        <p className="a-hint">{t('pay.owed_hint')}</p>
        {owed.length === 0 ? (
          <Empty>{t('pay.owed_empty')}</Empty>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              marginBlockStart: 'var(--space-3)',
            }}
          >
            {owed.map((row) => (
              <form
                key={`${row.supplierId}-${row.currency}`}
                className="a-day"
                action={createSettlement}
              >
                <input type="hidden" name="supplierId" value={row.supplierId ?? ''} />
                <input type="hidden" name="currency" value={row.currency ?? ''} />
                <div className="a-day-head">
                  <div className="a-day-no">
                    <Link href={adminHref(`/suppliers/${row.supplierId}`)}>{row.supplierName}</Link>
                  </div>
                  <b dir="ltr">
                    {formatMoney(Number(row.totalMinor), row.currency ?? 'USD', intl)}
                  </b>
                </div>
                <p className="a-hint">
                  {t('pay.owed_line', {
                    count: row.lines,
                    from: row.firstDay ?? '—',
                    to: row.lastDay ?? '—',
                  })}
                </p>
                <div className="a-row">
                  <div className="a-field">
                    <label htmlFor={`from-${row.supplierId}-${row.currency}`}>
                      {t('pay.from')}
                    </label>
                    <input
                      className="a-input"
                      type="date"
                      id={`from-${row.supplierId}-${row.currency}`}
                      name="from"
                      dir="ltr"
                    />
                  </div>
                  <div className="a-field">
                    <label htmlFor={`to-${row.supplierId}-${row.currency}`}>{t('pay.to')}</label>
                    <input
                      className="a-input"
                      type="date"
                      id={`to-${row.supplierId}-${row.currency}`}
                      name="to"
                      dir="ltr"
                    />
                  </div>
                  <div className="a-field">
                    <label htmlFor={`notes-${row.supplierId}-${row.currency}`}>
                      {t('pay.notes')}
                    </label>
                    <input
                      className="a-input"
                      id={`notes-${row.supplierId}-${row.currency}`}
                      name="notes"
                    />
                  </div>
                  <div className="a-actions">
                    <button className="a-btn" type="submit">
                      {t('pay.create')}
                    </button>
                  </div>
                </div>
                <span className="a-hint">{t('pay.period_hint')}</span>
              </form>
            ))}
          </div>
        )}
      </div>

      <div className="a-card">
        <h2>{t('pay.runs_title')}</h2>
        {runs.length === 0 ? (
          <Empty>{t('pay.runs_empty')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('pay.supplier')}</th>
                <th>{t('pay.period')}</th>
                <th className="num">{t('common.amount')}</th>
                <th>{t('common.status')}</th>
                <th>{t('pay.reference')}</th>
                <th>{t('pay.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(({ run, supplierName }) => (
                <tr key={run.id}>
                  <td>{supplierName}</td>
                  <td className="a-mono">
                    {run.periodFrom} – {run.periodTo}
                  </td>
                  <td className="num">{formatMoney(run.totalMinor, run.currency, intl)}</td>
                  <td>
                    <Pill tone={TONES[run.status] ?? 'neutral'}>
                      {t(`pay.status_${run.status}`)}
                    </Pill>
                    {run.paidAt ? (
                      <div className="a-muted">
                        <When value={run.paidAt} />
                      </div>
                    ) : null}
                  </td>
                  <td className="a-mono">{run.reference ?? '—'}</td>
                  <td>
                    <div style={{ display: 'grid', gap: 6 }}>
                      <a
                        className="a-btn ghost small"
                        href={adminHref(`/payables/${run.id}/export`)}
                      >
                        {t('pay.export')}
                      </a>
                      {run.status !== 'paid' ? (
                        <form
                          className="a-inline-form"
                          action={setSettlementStatus.bind(null, run.id)}
                          style={{ display: 'grid', gap: 6 }}
                        >
                          <input
                            className="a-input"
                            name="reference"
                            placeholder={t('pay.reference_placeholder')}
                            defaultValue={run.reference ?? ''}
                            aria-label={t('pay.reference')}
                          />
                          <div className="a-actions">
                            {run.status === 'draft' ? (
                              <button
                                className="a-btn ghost small"
                                name="status"
                                value="sent"
                                type="submit"
                              >
                                {t('pay.mark_sent')}
                              </button>
                            ) : null}
                            <button
                              className="a-btn small"
                              name="status"
                              value="paid"
                              type="submit"
                            >
                              {t('pay.mark_paid')}
                            </button>
                            {run.status === 'draft' ? (
                              <button
                                className="a-btn danger small"
                                name="status"
                                value="delete"
                                type="submit"
                              >
                                {t('pay.delete')}
                              </button>
                            ) : null}
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  )
}
