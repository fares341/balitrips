'use server'

import { redirect } from 'next/navigation'

import { locales } from '@/i18n/config'
import { toWhatsappNumber } from '@/lib/notify/whatsapp'
import { AUTOMATION_KEYS, AUTOMATIONS } from '@/lib/whatsapp/automations'
import { retryWhatsappMessage, sendWithSettings } from '@/lib/whatsapp/dispatch'
import {
  deleteWaSecret,
  PROVIDERS,
  readWhatsappSettings,
  writeWaSecret,
  writeWhatsappSettings,
  type AutomationSetting,
} from '@/lib/whatsapp/settings'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fenum, fint, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const PAGE = adminHref('/whatsapp')

/** Connection: provider, endpoint, credentials (write-only), master switch. */
export async function saveWhatsappConnection(form: FormData): Promise<void> {
  const actor = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const current = await readWhatsappSettings()
    const next = {
      ...current,
      enabled: fbool(form, 'enabled'),
      provider: fenum(form, 'provider', PROVIDERS, 'mazbot'),
      apiUrl: (fstr(form, 'apiUrl') ?? '').slice(0, 300),
      loginEmail: (fstr(form, 'loginEmail') ?? '').slice(0, 200),
      senderNumber: (fstr(form, 'senderNumber') ?? '').slice(0, 32),
      incompleteAfterMinutes: Math.min(
        24 * 60,
        Math.max(15, fint(form, 'incompleteAfterMinutes', 60)),
      ),
    }
    if (next.apiUrl !== '' && !/^https:\/\/[^\s]+$/.test(next.apiUrl)) {
      throw new Error('API endpoint must start with https://')
    }
    await writeWhatsappSettings(next, actor.userId)

    const apiKey = fstr(form, 'apiKey')
    if (fbool(form, 'clearKey')) await deleteWaSecret('whatsapp_api_key')
    else if (apiKey) await writeWaSecret('whatsapp_api_key', apiKey, actor.userId)
    const password = fstr(form, 'password')
    if (password) await writeWaSecret('whatsapp_password', password, actor.userId)

    await writeAudit({
      actor,
      action: 'whatsapp.settings',
      entityType: 'site_setting',
      entityId: null,
      before: {
        enabled: current.enabled,
        provider: current.provider,
        apiUrl: current.apiUrl,
        loginEmail: current.loginEmail,
        senderNumber: current.senderNumber,
      },
      after: {
        enabled: next.enabled,
        provider: next.provider,
        apiUrl: next.apiUrl,
        loginEmail: next.loginEmail,
        senderNumber: next.senderNumber,
        apiKeyChanged: Boolean(apiKey) || fbool(form, 'clearKey'),
        passwordChanged: Boolean(password),
      },
    })
    outcome = { ok: t('wa.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

/** Per automation: on/off, text per language, approved template id per language. */
export async function saveWhatsappAutomations(form: FormData): Promise<void> {
  const actor = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const current = await readWhatsappSettings()
    const automations: Record<string, AutomationSetting> = {}
    for (const key of AUTOMATION_KEYS) {
      const texts = { en: '', ar: '', id: '' }
      const templates = { en: '', ar: '', id: '' }
      for (const locale of locales) {
        const text = (form.get(`${key}.text.${locale}`) ?? '').toString().replace(/\r\n/g, '\n')
        const trimmed = text.trim().slice(0, 2000)
        // Same as the default = keep following the default.
        texts[locale] = trimmed === AUTOMATIONS[key].defaults[locale].trim() ? '' : trimmed
        templates[locale] = (fstr(form, `${key}.template.${locale}`) ?? '').slice(0, 120)
      }
      automations[key] = { enabled: fbool(form, `${key}.enabled`), texts, templates }
    }
    await writeWhatsappSettings({ ...current, automations }, actor.userId)
    await writeAudit({
      actor,
      action: 'whatsapp.automations',
      entityType: 'site_setting',
      entityId: null,
      before: null,
      after: Object.fromEntries(
        AUTOMATION_KEYS.map((key) => [key, automations[key]?.enabled ?? false]),
      ),
    })
    outcome = { ok: t('wa.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

export async function sendWhatsappTest(form: FormData): Promise<void> {
  await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const to = toWhatsappNumber(fstr(form, 'to'))
    if (to === null) throw new Error(t('wa.err_number'))
    const template = fstr(form, 'template')
    const text = (fstr(form, 'text') ?? t('wa.test_default')).slice(0, 1000)
    const settings = await readWhatsappSettings()
    const { result } = await sendWithSettings(settings, {
      to,
      text,
      locale: 'en',
      template,
      params: [],
    })
    outcome = result.ok
      ? { ok: t('wa.ok_test') }
      : { err: t('wa.err_test', { error: result.error }) }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}

export async function retryWhatsapp(form: FormData): Promise<void> {
  await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const id = fstr(form, 'id') ?? ''
    const ok = /^[0-9a-f-]{36}$/i.test(id) && (await retryWhatsappMessage(id))
    outcome = ok ? { ok: t('wa.ok_retry') } : { err: t('wa.err_retry') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}
