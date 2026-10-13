import { getAdminI18n } from './_lib/i18n'

/**
 * 404 for the admin branch.
 *
 * `requireCapability()` renders this for anyone who is not signed in, is not
 * elevated, or lacks the capability — a 403 would confirm that the
 * configured admin path exists, which is the one fact it is trying not to
 * leak. It renders no chrome and links nowhere, so it is indistinguishable
 * from any other unmatched path. Without the Studio language cookie (an
 * anonymous probe) it is English.
 *
 * It lives here rather than reusing `src/app/not-found.tsx` because that one
 * renders its own <html>, and this branch already has a root layout.
 */
export default async function AdminNotFound() {
  const { t } = await getAdminI18n()
  return (
    <main className="a-404">
      <h1>404</h1>
      <p className="a-muted">{t('shell.not_found_body')}</p>
    </main>
  )
}
