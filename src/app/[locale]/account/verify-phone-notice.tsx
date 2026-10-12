'use client'

/**
 * تحقق رقم الجوال (الوثيقة 3.1): زر يرسل رمزاً عبر واتساب، ثم خانة الرمز.
 * لا يمنع أي شيء في الموقع — يثبت أن الرقم لصاحبه (لاسترجاع كلمة المرور بالجوال).
 */

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'

import { sendPhoneCodeAction, verifyPhoneCodeAction } from './phone-actions'
import { IDLE_PHONE_STATE, type PhoneActionState } from './phone-contract'

export function VerifyPhoneNotice({ phone }: { phone: string }) {
  const t = useTranslations()
  const [sendState, setSendState] = useState<PhoneActionState>(IDLE_PHONE_STATE)
  const [sending, startSending] = useTransition()
  const [verifyState, verify, verifying] = useActionState(verifyPhoneCodeAction, IDLE_PHONE_STATE)

  const verified = verifyState.status === 'verified' || sendState.status === 'verified'
  const codeAsked = sendState.status === 'sent' || verifyState.status === 'sent'
  const message = verifyState.messageKey ?? sendState.messageKey

  const send = () =>
    startSending(async () => {
      setSendState(await sendPhoneCodeAction())
    })

  return (
    <div role="status" className="card" style={{ padding: 14, marginBottom: 18 }}>
      <p style={{ margin: '0 0 8px' }}>{t('acct_phone_verify_b', { phone })}</p>
      {verified ? null : (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button type="button" variant="ghost" size="sm" onClick={send} disabled={sending}>
            {t(codeAsked ? 'acct_phone_resend' : 'acct_phone_send')}
          </Button>
          {codeAsked && (
            <form action={verify} className="row" style={{ gap: 8 }}>
              <input
                className="input"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                aria-label={t('acct_phone_code')}
                style={{ width: 120, minHeight: 36, letterSpacing: 4 }}
                required
              />
              <Button type="submit" variant="forest" size="sm" disabled={verifying}>
                {t('acct_phone_confirm')}
              </Button>
            </form>
          )}
        </div>
      )}
      {message !== null && (
        <p className="muted" style={{ margin: '8px 0 0' }}>
          {t(message)}
        </p>
      )}
    </div>
  )
}
