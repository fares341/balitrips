import Link from 'next/link'

import { DEFAULT_FALLBACK_MODEL, DEFAULT_MODEL, hasApiKey } from '@/lib/assistant/config'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { readSetting } from '../../../_lib/settings'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import { Checkbox, Field, LocalizedField, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Pill } from '../../../_ui/table'
import { saveAssistantSettings } from '../../config/actions'

export const dynamic = 'force-dynamic'

/**
 * Studio → Assistant → Settings (admin only, `config.write`). Saved through
 * the same validated, audited `site_settings` path as every other setting.
 * The API key is deliberately not a field: it never leaves the environment.
 */
export default async function AssistantSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('config.write')
  const params = await searchParams
  const { t } = await getAdminI18n()
  const settings = await readSetting('assistant')
  const serverModel = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL
  const serverFallback = process.env.OPENROUTER_FALLBACK_MODEL?.trim() || DEFAULT_FALLBACK_MODEL

  return (
    <>
      <PageHead
        title={t('assistant.settings_title')}
        description={t('assistant.settings_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/assistant')}>
            {t('assistant.title')}
          </Link>
        }
      />
      <Flash searchParams={params} />
      <p className="a-ai-status">
        <Pill tone={hasApiKey() ? 'good' : 'warn'}>
          {hasApiKey() ? t('assistant.key_set') : t('assistant.key_missing')}
        </Pill>
      </p>
      <form action={saveAssistantSettings} className="a-card a-form">
        <Checkbox
          name="publicEnabled"
          label={t('assistant.public_enabled')}
          defaultChecked={settings.publicEnabled}
        />
        <Checkbox
          name="studioEnabled"
          label={t('assistant.studio_enabled')}
          defaultChecked={settings.studioEnabled}
        />
        <Field label={t('assistant.daily_ip')} htmlFor="dailyMessagesPerIp">
          <TextInput
            id="dailyMessagesPerIp"
            name="dailyMessagesPerIp"
            type="number"
            min={1}
            max={2000}
            dir="ltr"
            defaultValue={settings.dailyMessagesPerIp}
          />
        </Field>
        <Field
          label={t('assistant.daily_budget')}
          htmlFor="dailyBudgetUsd"
          hint={t('assistant.daily_budget_hint')}
        >
          <TextInput
            id="dailyBudgetUsd"
            name="dailyBudgetUsd"
            type="number"
            min={0}
            max={1000}
            step="0.01"
            dir="ltr"
            defaultValue={settings.dailyBudgetUsd}
          />
        </Field>
        <LocalizedField
          name="welcome"
          label={t('assistant.welcome_text')}
          hint={t('assistant.welcome_hint')}
          value={settings.welcome}
          rows={3}
        />
        <Advanced show title={t('assistant.advanced')} hint={t('common.advanced_hint')}>
          <Field
            label={t('assistant.model')}
            htmlFor="model"
            hint={t('assistant.model_hint', { model: serverModel })}
          >
            <TextInput
              id="model"
              name="model"
              dir="ltr"
              defaultValue={settings.model}
              placeholder={serverModel}
            />
          </Field>
          <Field
            label={t('assistant.fallback')}
            htmlFor="fallbackModel"
            hint={t('assistant.fallback_hint', { model: serverFallback })}
          >
            <TextInput
              id="fallbackModel"
              name="fallbackModel"
              dir="ltr"
              defaultValue={settings.fallbackModel}
              placeholder={serverFallback}
            />
          </Field>
        </Advanced>
        <div className="a-row">
          <button className="a-btn" type="submit">
            {t('assistant.save')}
          </button>
        </div>
      </form>
    </>
  )
}
