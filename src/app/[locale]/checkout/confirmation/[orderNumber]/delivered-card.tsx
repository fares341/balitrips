/**
 * «تم التسليم» — the itinerary card on the payment success page (phase 4).
 * Shown once the order is paid and it holds a bought itinerary: open it now
 * (account, no token), download the stamped PDF, and where it was sent.
 */

import { getTranslations } from 'next-intl/server'

import { LinkButton } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { getPathname } from '@/i18n/routing'
import { DELIVERY_PATHS, loadDeliveryState, type ChannelState } from '@/lib/itineraries/delivery'

export interface DeliveredLine {
  id: string
  name: string
}

function statusKey(state: ChannelState): string {
  if (state.status === 'sent') return 'dlv_st_sent'
  if (state.status === 'failed') return 'dlv_st_failed'
  if (state.status === 'skipped') return 'dlv_st_skipped'
  return 'dlv_st_queued'
}

export async function DeliveredCard({
  lines,
  email,
  locale,
}: {
  lines: readonly DeliveredLine[]
  email: string
  locale: Locale
}) {
  if (lines.length === 0) return null
  const t = await getTranslations({ locale })
  const states = await loadDeliveryState(lines.map((line) => line.id))

  return (
    <section className="panel stack dlv-card" aria-labelledby="cf-dlv-t">
      <span className="tag tag-ok" style={{ alignSelf: 'flex-start' }}>
        <Icon name="check" size={14} /> {t('dlv_ok_badge')}
      </span>
      <h2 className="h3" id="cf-dlv-t" style={{ margin: 0 }}>
        {t('dlv_ok_t')}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {email === '' ? t('dlv_ok_b_noemail') : t('dlv_ok_b', { email })}
      </p>
      {lines.map((line) => {
        const state = states.get(line.id)
        return (
          <div key={line.id} className="stack" style={{ gap: 10 }}>
            <b>{line.name}</b>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <LinkButton href={DELIVERY_PATHS.view(line.id)} variant="orange">
                {t('dlv_ok_open')}
              </LinkButton>
              {/* A route handler: a plain anchor with the locale prefix. */}
              <a
                className="btn btn-forest"
                href={getPathname({ href: DELIVERY_PATHS.download(line.id), locale })}
                download
              >
                <Icon name="pdf" size={16} /> {t('acct_sched_dl')}
              </a>
            </div>
            {state && (
              <ul className="row" style={{ gap: 14, listStyle: 'none', padding: 0, margin: 0 }}>
                {(['email', 'whatsapp'] as const).map((channel) => (
                  <li key={channel} className="muted" style={{ fontSize: 13 }}>
                    <Icon name={channel === 'email' ? 'mail' : 'whatsapp'} size={14} />{' '}
                    {t(channel === 'email' ? 'dlv_ch_email' : 'dlv_ch_whatsapp')}:{' '}
                    <b>{t(statusKey(state[channel]))}</b>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      <LinkButton href={DELIVERY_PATHS.account} variant="ghost" size="sm">
        {t('dlv_ok_all')}
      </LinkButton>
    </section>
  )
}
