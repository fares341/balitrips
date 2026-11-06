'use server'

import { redirect } from 'next/navigation'

import { locales } from '@/i18n/config'
import { leadSettingsSchema, readLeadSettings, writeLeadSettings } from '@/lib/leads/settings'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fint, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const PAGE = `${adminHref('/leads')}?tab=people`

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Lead capture: the offer popup and the abandoned-cart reminder. */
export async function saveLeadCaptureSettings(form: FormData): Promise<void> {
  const actor = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const current = await readLeadSettings()
    const next = leadSettingsSchema.parse({
      popupEnabled: fbool(form, 'popupEnabled'),
      discountPercent: clamp(fint(form, 'discountPercent', 10), 1, 50),
      delaySeconds: clamp(fint(form, 'delaySeconds', 25), 5, 300),
      couponValidDays: clamp(fint(form, 'couponValidDays', 30), 1, 365),
      headline: Object.fromEntries(
        locales.map((l) => [l, (fstr(form, `headline_${l}`) ?? '').slice(0, 160)]),
      ),
      abandonedEnabled: fbool(form, 'abandonedEnabled'),
      abandonedDelayMinutes: clamp(fint(form, 'abandonedDelayMinutes', 60), 30, 24 * 60),
    })
    await writeLeadSettings(next, actor.userId)
    await writeAudit({
      actor,
      action: 'leads.capture_settings',
      entityType: 'site_setting',
      entityId: null,
      before: current,
      after: next,
    })
    outcome = { ok: t('lc.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(PAGE, outcome))
}
