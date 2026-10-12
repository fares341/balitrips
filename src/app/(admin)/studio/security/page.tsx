import { readSecret, twoFactorStatus } from '../../_lib/two-factor'
import { getAdminSession } from '../../_lib/session'
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

export const metadata = {
  title: 'Security',
  robots: { index: false, follow: false },
}

export default async function SecurityPage() {
  const session = await getAdminSession()

  // Deliberately not `requireCapability()`: that helper enforces the very
  // two-factor check this page exists to satisfy.
  if (!session) notFound()

  const status = await twoFactorStatus(session.userId)

  // The secret is read only while enrolment is pending — once confirmed there
  // is nothing to show, and re-displaying it would let anyone with a live
  // session mint a second authenticator.
  const secret = status.enabled ? null : await readSecret(session.userId)

  const uri =
    secret === null ? null : otpauthUri({ secret, account: session.email, issuer: 'Bali Trips' })

  const qrSvg = uri === null ? null : qrToSvg(encodeQr(uri), { size: 208, title: 'Scan to enrol' })

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>Two-factor authentication</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        Required for staff and administrator accounts. Until it is active, this is the only admin
        page you can reach.
      </p>

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
