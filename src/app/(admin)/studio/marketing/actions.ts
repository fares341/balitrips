'use server'

import { redirect } from 'next/navigation'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { writeSecret, type SecretKey } from '@/lib/analytics/secrets'
import {
  MARKETING_SETTINGS_KEY,
  marketingSchema,
  readMarketingSettings,
} from '@/lib/analytics/settings'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { fbool, fint, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { encodeMessage, errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const BACK = adminHref('/marketing')

/**
 * Save "Marketing & tracking". Admin only (`config.write`), audited. Tokens
 * are written encrypted and never echoed: an empty token field keeps the
 * stored one, "remove" deletes it. The audit row records THAT a token
 * changed, never its value.
 */
export async function saveMarketingSettings(form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const before = await readMarketingSettings()
    const parsed = marketingSchema.safeParse({
      ga4Enabled: fbool(form, 'ga4Enabled'),
      ga4Id: fstr(form, 'ga4Id') ?? '',
      gtmEnabled: fbool(form, 'gtmEnabled'),
      gtmId: fstr(form, 'gtmId') ?? '',
      metaEnabled: fbool(form, 'metaEnabled'),
      metaPixelId: fstr(form, 'metaPixelId') ?? '',
      metaCapiEnabled: fbool(form, 'metaCapiEnabled'),
      tiktokEnabled: fbool(form, 'tiktokEnabled'),
      tiktokPixelId: fstr(form, 'tiktokPixelId') ?? '',
      tiktokEventsApiEnabled: fbool(form, 'tiktokEventsApiEnabled'),
      retentionMonths: fint(form, 'retentionMonths', 13, t('mk.retention')),
      abandonedEnabled: fbool(form, 'abandonedEnabled'),
      abandonedAfterHours: fint(form, 'abandonedAfterHours', 4, t('mk.abandoned_hours')),
    })
    if (!parsed.success) {
      const field = String(parsed.error.issues[0]?.path[0] ?? '')
      throw new Error(t('mk.err_invalid', { field: t(`mk.field_${field}`) }))
    }
    const after = parsed.data
    await db
      .insert(siteSettings)
      .values({ key: MARKETING_SETTINGS_KEY, value: after, updatedByActorId: session.userId })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: after, updatedByActorId: session.userId, updatedAt: new Date() },
      })

    const tokens: { field: string; key: SecretKey }[] = [
      { field: 'metaCapiToken', key: 'meta_capi_token' },
      { field: 'tiktokEventsToken', key: 'tiktok_events_token' },
    ]
    const tokenChanges: Record<string, string> = {}
    for (const { field, key } of tokens) {
      if (fbool(form, `${field}Remove`)) {
        await writeSecret(key, null, session.userId)
        tokenChanges[key] = 'removed'
        continue
      }
      const value = fstr(form, field)
      if (value !== null && value.trim() !== '') {
        if (value.length > 600 || /\s/.test(value.trim())) throw new Error(t('mk.err_token'))
        await writeSecret(key, value, session.userId)
        tokenChanges[key] = 'replaced'
      }
    }
    await writeAudit({
      actor: session,
      action: 'marketing.settings',
      entityType: 'site_setting',
      entityId: null,
      before: { ...before },
      after: { ...after, ...tokenChanges },
    })
    outcome = { ok: encodeMessage('mk.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(BACK, outcome))
}
