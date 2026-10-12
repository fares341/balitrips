/**
 * 404 for the admin branch.
 *
 * `requireCapability()` renders this for anyone who is not signed in, is not
 * elevated, or lacks the capability — a 403 would confirm that the
 * configured admin path exists, which is the one fact it is trying not to
 * leak. It renders no chrome and links nowhere, so it is indistinguishable
 * from any other unmatched path.
 *
 * It lives here rather than reusing `src/app/not-found.tsx` because that one
 * renders its own <html>, and this branch already has a root layout.
 */
export default function AdminNotFound() {
  return (
    <main style={{ padding: '80px 24px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 20, color: 'var(--forest-deep)' }}>404</h1>
      <p className="a-muted">This page could not be found.</p>
    </main>
  )
}
