'use client'

import { useActionState } from 'react'

import { useAdminT } from '../../_ui/i18n-provider'
import { IDLE_WEBHOOK_SECRET, type WebhookSecretState } from './contract'

/**
 * Generate the webhook signing secret and show it ONCE. The value arrives in
 * this action's response (not a URL, not the page HTML on reload) and is gone
 * as soon as the page is left; afterwards Studio shows only its last four.
 */
export function WebhookSecretForm({
  action,
  hasSecret,
  disabled,
}: {
  action: (previous: WebhookSecretState) => Promise<WebhookSecretState>
  hasSecret: boolean
  disabled: boolean
}) {
  const { t } = useAdminT()
  const [state, run, pending] = useActionState(action, IDLE_WEBHOOK_SECRET)

  return (
    <form action={run} className="a-form">
      {state.status === 'created' && state.secret ? (
        <div className="a-flash ok" role="status">
          <p>{t('int.secret_once')}</p>
          <code className="a-mono" dir="ltr" style={{ wordBreak: 'break-all', userSelect: 'all' }}>
            {state.secret}
          </code>
        </div>
      ) : null}
      {state.status === 'error' && state.error ? (
        <div className="a-flash err" role="alert">
          {state.error}
        </div>
      ) : null}
      <div className="a-actions">
        <button
          className={hasSecret ? 'a-btn ghost' : 'a-btn'}
          type="submit"
          disabled={disabled || pending}
          onClick={(event) => {
            if (hasSecret && !window.confirm(t('int.secret_rotate_confirm'))) event.preventDefault()
          }}
        >
          {pending ? t('int.working') : hasSecret ? t('int.secret_rotate') : t('int.secret_create')}
        </button>
      </div>
    </form>
  )
}
