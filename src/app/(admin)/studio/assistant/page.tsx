import Link from 'next/link'

import { hasApiKey, modelsFor } from '@/lib/assistant/config'
import { dailyState } from '@/lib/assistant/store'
import { can } from '@/lib/auth/roles'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { readSetting } from '../../_lib/settings'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { Pill } from '../../_ui/table'
import { StudioChat } from './studio-chat'

export const dynamic = 'force-dynamic'

/**
 * Studio → Assistant: the staff chat. Everyone with `admin.access` can open
 * it; what it can read or change is decided per tool, per call, by the
 * caller's own capabilities (src/lib/assistant/staff-tools.ts).
 */
export default async function AssistantPage() {
  const session = await requireCapability('admin.access')
  const { t } = await getAdminI18n()
  const [settings, today] = await Promise.all([readSetting('assistant'), dailyState(null)])
  const keySet = hasApiKey()
  const budgetUsed = today.globalCostMicros >= Math.round(settings.dailyBudgetUsd * 1_000_000)
  const [model, fallback] = modelsFor(settings)
  const ready = keySet && settings.studioEnabled && settings.dailyBudgetUsd > 0 && !budgetUsed
  const onOff = (value: boolean) => t(value ? 'assistant.state_on' : 'assistant.state_off')

  return (
    <>
      <PageHead
        title={t('assistant.title')}
        description={t('assistant.description')}
        actions={
          <>
            {can(session.role, 'customers.read') ? (
              <Link className="a-btn ghost" href={adminHref('/assistant/conversations')}>
                {t('assistant.link_conversations')}
              </Link>
            ) : null}
            {can(session.role, 'config.write') ? (
              <Link className="a-btn ghost" href={adminHref('/assistant/settings')}>
                {t('assistant.link_settings')}
              </Link>
            ) : null}
          </>
        }
      />

      <div className="a-card a-ai-status">
        <p>
          <Pill tone={ready ? 'good' : 'warn'}>
            {ready
              ? t('assistant.status_ready')
              : !keySet
                ? t('assistant.status_no_key')
                : !settings.studioEnabled || settings.dailyBudgetUsd <= 0
                  ? t('assistant.status_off')
                  : t('assistant.status_budget')}
          </Pill>
        </p>
        <p className="a-muted">
          {t('assistant.public_state', { state: onOff(settings.publicEnabled) })} ·{' '}
          {t('assistant.studio_state', { state: onOff(settings.studioEnabled) })} ·{' '}
          <span dir="ltr">{t('assistant.models_line', { model, fallback })}</span>
        </p>
        {can(session.role, 'config.write') ? (
          <p className="a-muted">
            {t('assistant.usage_today', {
              messages: today.globalMessages,
              cost: formatMoney(Math.round(today.globalCostMicros / 10_000), 'USD', 'en'),
              budget: formatMoney(Math.round(settings.dailyBudgetUsd * 100), 'USD', 'en'),
            })}
          </p>
        ) : null}
      </div>

      {ready ? <StudioChat /> : null}
    </>
  )
}
