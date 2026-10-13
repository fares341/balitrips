'use client'

/**
 * تحقق رقم الجوال (الوثيقة 3.1): زر يرسل رمزاً عبر واتساب، ثم خانة الرمز.
 * لا يمنع أي شيء في الموقع — يثبت أن الرقم لصاحبه (لاسترجاع كلمة المرور بالجوال).
 * رقم غير مُتحقق منه لا يستقبل رابط إعادة التعيين، وقد يسحبه صاحبه الحقيقي —
 * لذلك الإشعار بارز (حد برتقالي) حتى يتم التحقق.
 */

import { useActionState, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { Button } from '@/components/shared'

import { claimPhoneCodeAction, sendPhoneCodeAction, verifyPhoneCodeAction } from './phone-actions'
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
    <div
      role="status"
      className="card"
      style={{
        padding: 14,
        marginBottom: 18,
        borderInlineStart: verified ? undefined : '4px solid var(--orange)',
      }}
    >
      <p style={{ margin: '0 0 8px' }}>{t('acct_phone_verify_b', { phone })}</p>
      {verified ? null : (
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('acct_phone_verify_why')}</p>
      )}
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

/**
 * إثبات ملكية رقم محجوز لحساب آخر لم يتحقق منه (انظر رأس phone-actions.ts):
 * يُعرض عند خطأ "الرقم مسجّل" في الملف الشخصي. الرقم ينتقل لهذا الحساب فقط
 * بعد إدخال الرمز المرسل إليه على واتساب.
 */
export function ClaimPhoneForm({ initialPhone = '' }: { initialPhone?: string }) {
  const t = useTranslations()
  const [sendState, send, sending] = useActionState(claimPhoneCodeAction, IDLE_PHONE_STATE)
  const [verifyState, verify, verifying] = useActionState(verifyPhoneCodeAction, IDLE_PHONE_STATE)

  const verified = verifyState.status === 'verified' || sendState.status === 'verified'
  const codeAsked = sendState.status === 'sent' || verifyState.status === 'sent'
  const message = verifyState.messageKey ?? sendState.messageKey

  return (
    <div role="status" className="card" style={{ padding: 14, marginBottom: 18 }}>
      <p style={{ margin: '0 0 8px', fontWeight: 600 }}>{t('acct_phone_claim_t')}</p>
      <p className="muted" style={{ margin: '0 0 8px' }}>
        {t('acct_phone_claim_b')}
      </p>
      {verified ? null : (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <form action={send} className="row" style={{ gap: 8 }}>
            <input
              className="input"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              defaultValue={initialPhone}
              placeholder="+62 812 3456 7890"
              aria-label={t('auth_phone')}
              style={{ width: 200, minHeight: 36 }}
              required
            />
            <Button type="submit" variant="ghost" size="sm" disabled={sending}>
              {t(codeAsked ? 'acct_phone_resend' : 'acct_phone_send')}
            </Button>
          </form>
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
