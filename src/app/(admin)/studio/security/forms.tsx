'use client'

import { useActionState } from 'react'

import {
  beginEnrolment,
  confirmEnrolment,
  answerChallenge,
  regenerateRecoveryCodes,
  type EnrolmentResult,
} from './actions'
import { useAdminT } from '../../_ui/i18n-provider'

/**
 * The three states this page can be in:
 *
 *   not enrolled          -> start (mints a secret)
 *   enrolled, unconfirmed -> scan the QR, enter a code to confirm
 *   confirmed             -> challenge this session, or replace recovery codes
 *
 * Recovery codes are rendered from the action's return value rather than
 * re-read, because they are shown exactly once and never stored in plain text.
 */

type Props = {
  enabled: boolean
  pending: boolean
  recoveryCodesRemaining: number
  secret: string | null
  qrSvg: string | null
}

const panel: React.CSSProperties = {
  background: 'var(--white)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-md)',
  padding: 20,
  marginBlockEnd: 16,
}

export function EnrolmentForms({ enabled, pending, recoveryCodesRemaining, secret, qrSvg }: Props) {
  const { t } = useAdminT()
  const [confirmState, confirmAction, confirming] = useActionState<
    EnrolmentResult | null,
    FormData
  >(confirmEnrolment, null)

  const [regenState, regenAction, regenerating] = useActionState<EnrolmentResult | null, FormData>(
    regenerateRecoveryCodes,
    null,
  )

  const codes = confirmState?.codes ?? regenState?.codes

  return (
    <>
      {codes !== undefined && codes.length > 0 && (
        <div style={{ ...panel, borderColor: 'var(--orange)' }}>
          <h2 style={{ fontSize: 17, marginBlockEnd: 6 }}>{t('security.recovery_title')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBlockEnd: 12 }}>
            {t('security.recovery_shown_once')}
          </p>
          <ul
            dir="ltr"
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 8,
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {codes.map((code) => (
              <li key={code} style={{ background: 'var(--ivory-2)', padding: '8px 12px' }}>
                {code}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!enabled && !pending && (
        <form action={beginEnrolment} style={panel}>
          <h2 style={{ fontSize: 17, marginBlockEnd: 6 }}>{t('security.setup_title')}</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBlockEnd: 14 }}>
            {t('security.setup_text')}
          </p>
          <button type="submit" className="a-btn">
            {t('security.start_setup')}
          </button>
        </form>
      )}

      {!enabled && pending && (
        <form action={confirmAction} style={panel}>
          <h2 style={{ fontSize: 17, marginBlockEnd: 6 }}>{t('security.scan_title')}</h2>

          {qrSvg !== null && (
            <div
              style={{ marginBlock: 14 }}
              // The SVG is generated server-side from our own secret; there is
              // no user input anywhere in it.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}

          {secret !== null && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBlockEnd: 14 }}>
              {t('security.cannot_scan')}{' '}
              <code
                dir="ltr"
                style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}
              >
                {secret}
              </code>
            </p>
          )}

          <label htmlFor="code" style={{ display: 'block', fontSize: 14, marginBlockEnd: 6 }}>
            {t('security.six_digit_code')}
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="a-input"
            style={{ width: 140, marginInlineEnd: 10 }}
          />
          <button type="submit" className="a-btn" disabled={confirming}>
            {confirming ? t('security.checking') : t('security.confirm')}
          </button>

          {confirmState !== null && !confirmState.ok && (
            <p
              role="alert"
              style={{ color: 'var(--orange-deep)', marginBlockStart: 10, fontSize: 14 }}
            >
              {confirmState.message}
            </p>
          )}
        </form>
      )}

      {enabled && (
        <>
          <form action={answerChallenge} style={panel}>
            <h2 style={{ fontSize: 17, marginBlockEnd: 6 }}>{t('security.verify_title')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBlockEnd: 14 }}>
              {t('security.verify_text')}
            </p>
            <label
              htmlFor="challenge"
              style={{ display: 'block', fontSize: 14, marginBlockEnd: 6 }}
            >
              {t('security.code')}
            </label>
            <input
              id="challenge"
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              required
              className="a-input"
              style={{ width: 200, marginInlineEnd: 10 }}
            />
            <button type="submit" className="a-btn">
              {t('security.verify')}
            </button>
          </form>

          <form action={regenAction} style={panel}>
            <h2 style={{ fontSize: 17, marginBlockEnd: 6 }}>{t('security.recovery_title')}</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBlockEnd: 14 }}>
              {t('security.recovery_remaining', { count: recoveryCodesRemaining })}
            </p>
            <label htmlFor="regen" style={{ display: 'block', fontSize: 14, marginBlockEnd: 6 }}>
              {t('security.current_code')}
            </label>
            <input
              id="regen"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className="a-input"
              style={{ width: 140, marginInlineEnd: 10 }}
            />
            <button type="submit" className="a-btn ghost" disabled={regenerating}>
              {regenerating ? t('security.working') : t('security.replace_codes')}
            </button>

            {regenState !== null && !regenState.ok && (
              <p
                role="alert"
                style={{ color: 'var(--orange-deep)', marginBlockStart: 10, fontSize: 14 }}
              >
                {regenState.message}
              </p>
            )}
          </form>
        </>
      )}
    </>
  )
}
