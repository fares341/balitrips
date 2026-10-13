import { readSecret, twoFactorStatus } from '../../_lib/two-factor'
import { getAdminSession } from '../../_lib/session'
import { getAdminI18n } from '../../_lib/i18n'
import { qrToSvg, encodeQr } from '../../_lib/qr'
import { otpauthUri } from '@/lib/auth/totp'
import { notFound } from 'next/navigation'

import { EnrolmentForms } from './forms'

/**
 * Two-factor enrolment and challenge.
 *
 * This page is the ONE admin route exempt from the two-factor gate — it has
 * to be, because it is where the second factor is set up. Gating it would
 * redirect an unenrolled admin here and then refuse to render it, which is
 * exactly the loop that made the admin unreachable before this page existed.
 *
 * It still requires an elevated session: `getAdminSession()` returns null for
 * anonymous visitors and for customers, and this 404s rather than redirecting,
 * so it leaks nothing about the admin's location.
 */

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const { t } = await getAdminI18n()
  return {
    title: t('security.meta_title'),
    robots: { index: false, follow: false },
  }
}

export default async function SecurityPage() {
  const session = await getAdminSession()

  // Deliberately not `requireCapability()`: that helper enforces the very
  // two-factor check this page exists to satisfy.
  if (!session) notFound()
  const { t } = await getAdminI18n()

  const status = await twoFactorStatus(session.userId)

  // The secret is read only while enrolment is pending — once confirmed there
  // is nothing to show, and re-displaying it would let anyone with a live
  // session mint a second authenticator.
  const secret = status.enabled ? null : await readSecret(session.userId)

  const uri =
    secret === null ? null : otpauthUri({ secret, account: session.email, issuer: 'Bali Trips' })

  const qrSvg =
    uri === null ? null : qrToSvg(encodeQr(uri), { size: 208, title: t('security.qr_title') })

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, marginBlockEnd: 8 }}>{t('security.page_title')}</h1>
      <p style={{ color: 'var(--muted)', marginBlockEnd: 24 }}>{t('security.page_intro')}</p>

      <EnrolmentForms
        enabled={status.enabled}
        pending={status.pending}
        recoveryCodesRemaining={status.recoveryCodesRemaining}
        secret={secret}
        qrSvg={qrSvg}
      />
    </div>
  )
}
