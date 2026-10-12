import { param } from '../_lib/result'

/**
 * Result banner.
 *
 * Server actions redirect back with `?ok=` or `?err=`. That keeps state out
 * of the client entirely — a reload re-reads the database rather than
 * replaying a stale optimistic update.
 */
export function Flash({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const ok = param(searchParams, 'ok')
  const err = param(searchParams, 'err')

  if (!ok && !err) return null

  return (
    <div className={`a-flash ${err ? 'err' : 'ok'}`} role="status">
      {err ?? ok}
    </div>
  )
}
