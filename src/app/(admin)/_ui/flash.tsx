import { localizeMessage, param } from '../_lib/result'
import { uiI18n } from './i18n-server'
import { Icon } from './icons'

/**
 * Result banner.
 *
 * Server actions redirect back with `?ok=` or `?err=`. That keeps state out
 * of the client entirely — a reload re-reads the database rather than
 * replaying a stale optimistic update. Messages made by the shared form
 * helpers arrive as dictionary keys and are translated here.
 */
export async function Flash({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const ok = param(searchParams, 'ok')
  const err = param(searchParams, 'err')

  if (!ok && !err) return null

  const { t } = await uiI18n()
  const text = localizeMessage(err ?? ok ?? '', t)

  return (
    <div
      className={`a-flash ${err ? 'err' : 'ok'}`}
      role={err ? 'alert' : 'status'}
      aria-live={err ? 'assertive' : 'polite'}
    >
      <Icon name={err ? 'alert' : 'check'} size={20} />
      <span>{text}</span>
    </div>
  )
}
