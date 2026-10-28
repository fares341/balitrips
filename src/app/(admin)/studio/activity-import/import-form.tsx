'use client'

import { startTransition, useActionState, useRef, type FormEvent } from 'react'

import { useAdminT } from '../../_ui/i18n-provider'
import { sheetImport, type SheetImportState } from './actions'

const INITIAL: SheetImportState = {
  stage: 'idle',
  fileName: null,
  token: null,
  preview: null,
  message: null,
  warnings: [],
}

/**
 * «رفع ملف»: pick the .xlsx/.csv, «Preview» lists new / changed / wrong rows,
 * «Apply» writes them (enabled only after a clean preview of this file).
 */
export function ImportForm() {
  const { t } = useAdminT()
  const [state, action, pending] = useActionState(sheetImport, INITIAL)
  const formRef = useRef<HTMLFormElement>(null)
  const preview = state.preview
  // Submitted by hand (not `action={…}`): React resets a form after an
  // action, which would empty the file input between «Preview» and «Apply».
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const data = new FormData(event.currentTarget, submitter)
    startTransition(() => action(data))
  }
  const canApply =
    state.stage === 'preview' &&
    preview !== null &&
    preview.counts.errors === 0 &&
    preview.counts.new + preview.counts.update > 0

  return (
    <form ref={formRef} className="a-form" onSubmit={onSubmit} data-testid="sheet-import">
      <div className="a-card">
        <div className="a-field">
          <label htmlFor="file">{t('sh.file')}</label>
          <input
            className="a-input"
            id="file"
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          />
          <span className="a-hint">{t('sh.file_hint')}</span>
        </div>
        <input type="hidden" name="token" value={state.token ?? ''} />
        <div className="a-actions">
          <button
            className="a-btn ghost"
            type="submit"
            name="mode"
            value="preview"
            disabled={pending}
          >
            {pending ? t('sh.working') : t('sh.preview')}
          </button>
          <button
            className="a-btn"
            type="submit"
            name="mode"
            value="apply"
            disabled={pending || !canApply}
            title={canApply ? undefined : t('sh.apply_hint')}
          >
            {t('sh.apply')}
          </button>
        </div>
      </div>

      {state.message ? (
        <div
          className={`a-flash ${state.stage === 'error' || (preview?.counts.errors ?? 0) > 0 ? 'err' : 'ok'}`}
          role={state.stage === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          {state.message}
        </div>
      ) : null}

      {state.warnings.length > 0 ? (
        <div className="a-card" role="status">
          <h2>{t('sh.warnings')}</h2>
          <ul className="a-checklist">
            {state.warnings.map((warning, index) => (
              <li key={index} className="missing">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {preview ? (
        <div className="a-card" data-testid="sheet-preview">
          <h2>{t('sh.preview_title', { file: state.fileName ?? '' })}</h2>
          <p className="a-hint">
            {t('sh.counts', {
              new: preview.counts.new,
              update: preview.counts.update,
              same: preview.counts.same,
              errors: preview.counts.errors,
            })}
          </p>
          {preview.issues.length > 0 ? (
            <>
              <h3>{t('sh.errors')}</h3>
              <ul className="a-checklist" data-testid="sheet-errors">
                {preview.issues.map((issue, index) => (
                  <li key={index} className="missing">
                    {issue}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {preview.items.length > 0 ? (
            <div className="a-table-wrap">
              <table className="a-table" data-testid="sheet-items">
                <thead>
                  <tr>
                    <th>{t('sh.col_activity')}</th>
                    <th>{t('sh.col_result')}</th>
                    <th>{t('sh.col_changes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.items.map((item) => (
                    <tr key={item.slug} data-kind={item.kind}>
                      <td>
                        <b>{item.name}</b>
                        <br />
                        <span className="a-hint" dir="ltr">
                          {item.slug}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`a-pill ${item.kind === 'new' ? 'good' : item.kind === 'update' ? 'warn' : 'neutral'}`}
                        >
                          {t(`sh.kind_${item.kind}`)}
                        </span>
                      </td>
                      <td>
                        {item.changes.length > 0 ? (
                          <span dir="auto" style={{ wordBreak: 'break-word' }}>
                            {item.changes.join(' · ')}
                          </span>
                        ) : (
                          '—'
                        )}
                        {item.warnings.map((warning, index) => (
                          <div key={index} className="a-hint">
                            ⚠ {warning}
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}
