'use client'

/**
 * تذكير بتأكيد البريد + إعادة إرسال الرابط. التأكيد لا يمنع شيئاً؛ فائدته
 * أن رسائل الحجز تصل لبريد صحيح، وأن الباقة العائلية تضيفك مباشرة.
 */

import { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { authClient, authErrorKey } from '@/components/auth'
import { Button } from '@/components/shared'

export function VerifyEmailNotice({ email }: { email: string }) {
  const t = useTranslations()
  const locale = useLocale()
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | string>('idle')

  const resend = async () => {
    setState('sending')
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: `/${locale}/account?verified=1`,
    })
    setState(error ? authErrorKey(error) : 'sent')
  }

  return (
    <div role="status" className="card" style={{ padding: 14, marginBottom: 18 }}>
      <p style={{ margin: '0 0 8px' }}>{t('acct_verify_b', { email })}</p>
      {state === 'sent' ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('acct_verify_sent')}
        </p>
      ) : (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resend}
            disabled={state === 'sending'}
          >
            {t('acct_verify_resend')}
          </Button>
          {state !== 'idle' && state !== 'sending' && (
            <p className="muted" style={{ margin: '8px 0 0' }}>
              {t(state)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
