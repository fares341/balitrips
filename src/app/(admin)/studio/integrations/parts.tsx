import type { Translate } from '../../_i18n'
import { Advanced } from '../../_ui/advanced'
import { Pill } from '../../_ui/table'

/** Explains, in plain words, why keys cannot be saved yet — and what to do. */
export function KeyNotice({ status, t }: { status: 'ok' | 'missing'; t: Translate }) {
  if (status === 'ok') return null
  return (
    <div className="a-flash warn" role="status">
      <div>
        <strong>{t('int.key_title')}</strong>
        <p>{t(`int.key_${status}`)}</p>
        <Advanced show title={t('common.advanced')}>
          <p className="a-hint">{t('int.key_technical')}</p>
        </Advanced>
      </div>
    </div>
  )
}

const TONES: Record<string, 'good' | 'warn' | 'bad' | 'neutral'> = {
  active: 'good',
  paused: 'neutral',
  error: 'bad',
}

export function StatusPill({ status, t }: { status: string; t: Translate }) {
  return <Pill tone={TONES[status] ?? 'neutral'}>{t(`int.status_${status}`)}</Pill>
}
