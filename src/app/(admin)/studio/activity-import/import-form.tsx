'use client'

import { useActionState } from 'react'

import { useAdminT } from '../../_ui/i18n-provider'
import { importActivities, type ImportState } from './actions'

const INITIAL: ImportState = {
  checked: false,
  imported: 0,
  errors: [],
  summary: null,
  message: null,
}

/** Upload (or paste) the CSV, check it, then import when it is clean. */
export function ImportForm() {
  const { t } = useAdminT()
  const [state, action, pending] = useActionState(importActivities, INITIAL)
  return (
    <form className="a-form" action={action}>
      <div className="a-card">
        <div className="a-field">
          <label htmlFor="file">{t('av2.imp_file')}</label>
          <input className="a-input" id="file" name="file" type="file" accept=".csv,text/csv" />
        </div>
        <div className="a-field">
          <label htmlFor="csv">{t('av2.imp_paste')}</label>
          <textarea className="a-textarea" id="csv" name="csv" rows={6} dir="ltr" />
        </div>
        <div className="a-actions">
          <button
            className="a-btn ghost"
            type="submit"
            name="mode"
            value="check"
            disabled={pending}
          >
            {t('av2.imp_check')}
          </button>
          <button className="a-btn" type="submit" name="mode" value="import" disabled={pending}>
            {t('av2.imp_run')}
          </button>
        </div>
      </div>
      {state.message || state.errors.length > 0 || state.summary ? (
        <div className="a-card" role="status" aria-live="polite">
          {state.message ? (
            <p>
              <b>{state.message}</b>
            </p>
          ) : null}
          {state.summary ? (
            <p className="a-hint">
              {t('av2.imp_summary', {
                activities: state.summary.activities,
                packages: state.summary.packages,
                addons: state.summary.addons,
                faq: state.summary.faq,
              })}
            </p>
          ) : null}
          {state.errors.length > 0 ? (
            <ul className="a-checklist">
              {state.errors.map((error, index) => (
                <li key={index} className="missing">
                  {error}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
