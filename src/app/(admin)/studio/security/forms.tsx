'use client'

import { useActionState } from 'react'

import {
  beginEnrolment,
  confirmEnrolment,
  answerChallenge,
  regenerateRecoveryCodes,
  type EnrolmentResult,
} from './actions'

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
  marginBottom: 16,
}

export function EnrolmentForms({ enabled, pending, recoveryCodesRemaining, secret, qrSvg }: Props) {
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
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Recovery codes</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 12 }}>
            Shown once. Store them somewhere you can reach without this account — each works a
            single time.
          </p>
          <ul
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
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Set up</h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 14 }}>
            Generates a secret for your authenticator app. Nothing changes until you confirm it with
            a code, so closing this page cannot lock you out.
          </p>
          <button type="submit" className="btn btn-orange">
            Start setup
          </button>
        </form>
      )}

      {!enabled && pending && (
        <form action={confirmAction} style={panel}>
          <h2 style={{ fontSize: 17, marginBottom: 6 }}>Scan and confirm</h2>

          {qrSvg !== null && (
            <div
              style={{ margin: '14px 0' }}
              // The SVG is generated server-side from our own secret; there is
              // no user input anywhere in it.
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          )}

          {secret !== null && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 14 }}>
              Cannot scan?{' '}
              <code style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                {secret}
              </code>
            </p>
          )}

          <label htmlFor="code" style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>
            Six-digit code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            style={{ width: 140, marginInlineEnd: 10 }}
          />
          <button type="submit" className="btn btn-orange" disabled={confirming}>
            {confirming ? 'Checking…' : 'Confirm'}
          </button>

          {confirmState !== null && !confirmState.ok && (
            <p role="alert" style={{ color: 'var(--orange-deep)', marginTop: 10, fontSize: 14 }}>
              {confirmState.message}
            </p>
          )}
        </form>
      )}

      {enabled && (
        <>
          <form action={answerChallenge} style={panel}>
            <h2 style={{ fontSize: 17, marginBottom: 6 }}>Verify this session</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 14 }}>
              Two-factor is active. Enter a current code — or a recovery code — to unlock the admin
              in this browser.
            </p>
            <label htmlFor="challenge" style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>
              Code
            </label>
            <input
              id="challenge"
              name="code"
              inputMode="text"
              autoComplete="one-time-code"
              required
              style={{ width: 200, marginInlineEnd: 10 }}
            />
            <button type="submit" className="btn btn-orange">
              Verify
            </button>
          </form>

          <form action={regenAction} style={panel}>
            <h2 style={{ fontSize: 17, marginBottom: 6 }}>Recovery codes</h2>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 14 }}>
              {recoveryCodesRemaining} remaining. Replacing them invalidates the previous set
              immediately.
            </p>
            <label htmlFor="regen" style={{ display: 'block', fontSize: 14, marginBottom: 6 }}>
              Current code
            </label>
            <input
              id="regen"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              style={{ width: 140, marginInlineEnd: 10 }}
            />
            <button type="submit" className="btn btn-ghost" disabled={regenerating}>
              {regenerating ? 'Working…' : 'Replace codes'}
            </button>

            {regenState !== null && !regenState.ok && (
              <p role="alert" style={{ color: 'var(--orange-deep)', marginTop: 10, fontSize: 14 }}>
                {regenState.message}
              </p>
            )}
          </form>
        </>
      )}
    </>
  )
}
