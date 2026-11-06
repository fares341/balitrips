/**
 * «تسليم الجدول» on a Studio order (phase 4): per bought itinerary, the
 * e-mail and WhatsApp status (sent / failed / skipped + time + reason) and a
 * confirmed «إعادة الإرسال».
 */

import { loadDeliveryState, type ChannelState } from '@/lib/itineraries/delivery'

import type { Translate } from '../../../_i18n'
import { ConfirmSubmit } from '../../../_ui/confirm-submit'
import { Pill, Table, type PillTone } from '../../../_ui/table'
import { resendDelivery } from './delivery-actions'

const TONE: Record<string, PillTone> = {
  sent: 'good',
  failed: 'bad',
  skipped: 'warn',
  queued: 'info',
  sending: 'info',
  pending: 'neutral',
}

const KNOWN_REASONS = new Set([
  'not_configured',
  'automation_off',
  'no_consent',
  'no_number',
  'no_email',
  'not_paid',
])

function reason(t: Translate, state: ChannelState): string {
  if (!state.error) return ''
  return KNOWN_REASONS.has(state.error) ? t(`dlv.why_${state.error}`) : state.error
}

export async function DeliveryPanel({
  orderId,
  lines,
  t,
  intl,
  mayResend,
}: {
  orderId: string
  lines: readonly { id: string; name: string }[]
  t: Translate
  intl: string
  mayResend: boolean
}) {
  if (lines.length === 0) return null
  const states = await loadDeliveryState(lines.map((line) => line.id))
  const when = (at: Date | null) =>
    at === null
      ? '—'
      : new Intl.DateTimeFormat(intl, { dateStyle: 'medium', timeStyle: 'short' }).format(at)

  return (
    <div className="a-card" id="delivery">
      <h2>{t('dlv.title')}</h2>
      <p className="a-hint">{t('dlv.hint')}</p>
      {lines.map((line) => {
        const state = states.get(line.id)
        if (!state) return null
        return (
          <div key={line.id} style={{ marginBlockEnd: 16 }}>
            <h3 style={{ fontSize: 15, margin: '8px 0' }}>
              {line.name}{' '}
              {state.round > 0 ? (
                <span className="a-muted">· {t('dlv.round', { n: state.round })}</span>
              ) : null}
            </h3>
            <Table>
              <thead>
                <tr>
                  <th>{t('dlv.channel')}</th>
                  <th>{t('dlv.status')}</th>
                  <th>{t('dlv.time')}</th>
                  <th>{t('dlv.to')}</th>
                  <th>{t('dlv.note')}</th>
                </tr>
              </thead>
              <tbody>
                {(['email', 'whatsapp'] as const).map((channel) => {
                  const s = state[channel]
                  return (
                    <tr key={channel}>
                      <td>{t(`dlv.${channel}`)}</td>
                      <td>
                        <Pill tone={TONE[s.status] ?? 'neutral'}>{t(`dlv.st_${s.status}`)}</Pill>
                      </td>
                      <td>{when(s.at)}</td>
                      <td dir="ltr">{s.recipient ?? '—'}</td>
                      <td className="a-muted">{reason(t, s) || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
            {mayResend ? (
              <form
                className="a-row"
                style={{ gap: 8, marginBlockStart: 8, flexWrap: 'wrap' }}
                action={resendDelivery.bind(null, orderId, line.id)}
              >
                <ConfirmSubmit
                  className="a-btn small"
                  label={t('dlv.resend')}
                  title={t('dlv.resend_title')}
                  message={t('dlv.resend_msg')}
                  name="channel"
                  value="both"
                />
                <ConfirmSubmit
                  className="a-btn ghost small"
                  label={t('dlv.resend_email')}
                  title={t('dlv.resend_title')}
                  message={t('dlv.resend_msg')}
                  name="channel"
                  value="email"
                />
                <ConfirmSubmit
                  className="a-btn ghost small"
                  label={t('dlv.resend_whatsapp')}
                  title={t('dlv.resend_title')}
                  name="channel"
                  value="whatsapp"
                />
              </form>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
