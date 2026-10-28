import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { activityOperators, type ContractSummary } from '@/db/schema'
import { hasApiKey } from '@/lib/assistant/config'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { Field, TextArea, TextInput } from '../../../_ui/field'
import { When } from '../../../_ui/table'
import {
  removeContract,
  saveOperator,
  summarizeContract,
  uploadContract,
} from '../operator-actions'

const SUMMARY_ROWS: readonly (keyof Omit<ContractSummary, 'redFlags'>)[] = [
  'prices',
  'paymentTerms',
  'cancellation',
  'liabilities',
  'duration',
  'other',
]

/** «المشغّل» — staff only (the page shows this tab to `prices.write` holders). */
export async function OperatorTab({ activityId }: { activityId: string }) {
  const { t } = await getAdminI18n()
  const [row] = await db
    .select()
    .from(activityOperators)
    .where(eq(activityOperators.activityId, activityId))
    .limit(1)
  const aiReady = hasApiKey()
  const summary = row?.contractSummary ?? null

  return (
    <>
      <p className="a-flash warn" role="note">
        {t('oo.op_private')}
      </p>

      <form className="a-card a-form" action={saveOperator.bind(null, activityId)}>
        <h2>{t('oo.op_details')}</h2>
        <div className="a-row">
          <Field label={t('oo.op_name')} htmlFor="opName">
            <TextInput id="opName" name="opName" defaultValue={row?.name ?? ''} maxLength={200} />
          </Field>
          <Field label={t('oo.op_contact')} htmlFor="opContact">
            <TextInput
              id="opContact"
              name="opContact"
              defaultValue={row?.contactPerson ?? ''}
              maxLength={200}
            />
          </Field>
          <Field label={t('oo.op_phone')} htmlFor="opPhone" hint={t('oo.op_phone_hint')}>
            <TextInput
              id="opPhone"
              name="opPhone"
              dir="ltr"
              inputMode="tel"
              defaultValue={row?.phone ?? ''}
              maxLength={40}
            />
          </Field>
          <Field label={t('oo.op_email')} htmlFor="opEmail">
            <TextInput
              id="opEmail"
              name="opEmail"
              type="email"
              dir="ltr"
              defaultValue={row?.email ?? ''}
              maxLength={200}
            />
          </Field>
        </div>
        <Field
          label={t('oo.op_commission')}
          htmlFor="opCommission"
          hint={t('oo.op_commission_hint')}
        >
          <TextArea
            id="opCommission"
            name="opCommission"
            rows={4}
            defaultValue={row?.commissionNotes ?? ''}
          />
        </Field>
        <Field label={t('oo.op_cancellation')} htmlFor="opCancellation">
          <TextArea
            id="opCancellation"
            name="opCancellation"
            rows={4}
            defaultValue={row?.cancellationTerms ?? ''}
          />
        </Field>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('oo.op_save')}
          </button>
        </div>
      </form>

      <section className="a-card">
        <h2>{t('oo.op_contract')}</h2>
        {row?.contractKey ? (
          <div className="a-actions" style={{ marginBlockEnd: 14 }}>
            <a
              className="a-btn ghost"
              href={adminHref(`/activities/${activityId}/contract`)}
              download
            >
              {t('oo.op_download', { name: row.contractFilename ?? 'contract.pdf' })}
            </a>
            <span className="a-hint">
              <When value={row.contractUploadedAt} />
              {row.contractBytes ? ` · ${Math.ceil(row.contractBytes / 1024)} KB` : ''}
            </span>
            <form action={removeContract.bind(null, activityId)}>
              <button className="a-btn ghost small" type="submit">
                {t('oo.op_remove')}
              </button>
            </form>
          </div>
        ) : (
          <p className="a-hint">{t('oo.op_no_contract')}</p>
        )}
        <form className="a-row" action={uploadContract.bind(null, activityId)}>
          <Field label={t('oo.op_upload')} htmlFor="contract" hint={t('oo.op_upload_hint')}>
            <input
              className="a-input"
              id="contract"
              name="contract"
              type="file"
              accept="application/pdf,.pdf"
              required
            />
          </Field>
          <div className="a-actions">
            <button className="a-btn ghost" type="submit">
              {row?.contractKey ? t('oo.op_replace') : t('oo.op_upload_btn')}
            </button>
          </div>
        </form>
      </section>

      <section className="a-card">
        <div className="a-card-head">
          <h2>{t('oo.op_summary')}</h2>
          {row?.contractKey ? (
            <form action={summarizeContract.bind(null, activityId)}>
              <button className="a-btn accent" type="submit" disabled={!aiReady}>
                {t('oo.op_summarize')}
              </button>
            </form>
          ) : null}
        </div>
        {!aiReady ? <p className="a-flash warn">{t('oo.op_no_ai')}</p> : null}
        {summary ? (
          <>
            <p className="a-flash warn" role="note">
              {t('oo.op_ai_note')}
            </p>
            <table className="a-table a-summary">
              <tbody>
                {SUMMARY_ROWS.map((key) => (
                  <tr key={key}>
                    <th scope="row">{t(`oo.op_s_${key}`)}</th>
                    <td style={{ whiteSpace: 'pre-wrap' }}>{summary[key] || '—'}</td>
                  </tr>
                ))}
                <tr>
                  <th scope="row">{t('oo.op_s_redFlags')}</th>
                  <td>
                    {summary.redFlags.length === 0 ? (
                      '—'
                    ) : (
                      <ul className="a-flags">
                        {summary.redFlags.map((flag, index) => (
                          <li key={index}>{flag}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="a-hint" style={{ marginBlockStart: 8 }}>
              {t('oo.op_summary_meta', { model: row?.summaryModel ?? '—' })}{' '}
              <When value={row?.summaryAt ?? null} />
            </p>
          </>
        ) : (
          <p className="a-hint">
            {row?.contractKey ? t('oo.op_summary_none') : t('oo.op_summary_need_file')}
          </p>
        )}
      </section>
    </>
  )
}
