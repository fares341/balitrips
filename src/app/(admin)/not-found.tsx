import { isElevated } from '@/lib/auth/roles'
import { getSession } from '@/lib/auth/session'

import { getAdminI18n } from './_lib/i18n'

/**
 * 404 for the admin branch.
 *
 * Rendered for a signed-in account that lacks the role or the capability
 * (a visitor with no session is sent to sign-in instead, see
 * `_lib/session.ts`). A customer account that opens the Studio link gets one
 * line saying why, because "This page could not be found" on its own reads
 * as "the dashboard is broken" to an owner who simply signed in with the
 * wrong account. It names only the viewer's own email, nothing about the
 * Studio. Without the Studio language cookie it is English.
 *
 * It lives here rather than reusing `src/app/not-found.tsx` because that one
 * renders its own <html>, and this branch already has a root layout.
 */
export default async function AdminNotFound() {
  const { t } = await getAdminI18n()
  const session = await getSession().catch(() => null)
  const wrongAccount = session !== null && !isElevated(session.user.role)

  return (
    <main className="a-404">
      <h1>404</h1>
      <p className="a-muted">{t('shell.not_found_body')}</p>
      {wrongAccount && (
        <>
          <p
            className="a-muted"
            style={{ maxWidth: '52ch', marginInline: 'auto', marginBlockStart: 12 }}
          >
            {t('shell.no_access_body', { email: session?.user.email ?? '' })}
          </p>
          <p style={{ marginBlockStart: 16 }}>
            <a href="/account" className="btn btn-orange">
              {t('shell.no_access_link')}
            </a>
          </p>
        </>
      )}
    </main>
  )
}
