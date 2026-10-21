'use server'

import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { plans } from '@/db/schema'
import { ENTITLEMENT_KINDS } from '@/lib/entitlements'
import { MAX_DEVICE_LIMIT } from '@/lib/security/config'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fenum,
  fint,
  fintOrNull,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  fcurrencyOr,
  fmoney,
  freq,
  fstr,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome, type ActionOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

/**
 * الباقات. السعر والمدة وحد الأجهزة قرارات تجارية → `config.write` (المدير).
 *
 * التعديل لا يمسّ من اشترى سابقاً: المدة وحد الأجهزة نُسخا إلى صف
 * `entitlements` وقت الشراء. السعر الجديد يسري على السلال من الطلب التالي
 * (`buildQuote` يقرأ من هنا)، والطلبات القائمة محفوظة كلقطات.
 */

const LIST = adminHref('/plans')

const refreshPublic = () => revalidatePath('/[locale]/plans', 'page')

export async function savePlan(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let target = id === 'new' ? LIST : adminHref(`/plans/${id}`)
  let outcome: ActionOutcome

  try {
    const durationDays = fintOrNull(form, 'durationDays', t('plans.field_duration'))
    if (durationDays !== null && (durationDays < 1 || durationDays > 3650)) {
      throw new Error(t('plans.err_duration'))
    }
    const maxMembers = fint(form, 'maxMembers', 1, t('plans.field_members'))
    if (maxMembers < 1 || maxMembers > 10) throw new Error(t('plans.err_members'))
    const deviceLimit = fint(form, 'deviceLimit', 2, t('plans.device_limit'))
    if (deviceLimit < 1 || deviceLimit > MAX_DEVICE_LIMIT) {
      throw new Error(t('plans.err_device_limit', { max: MAX_DEVICE_LIMIT }))
    }
    const status = form.get('status') === 'published' ? 'published' : 'draft'

    const values = {
      slug: assertSlug(freq(form, 'slug', t('common.slug'))).slice(0, 64),
      name: flocalizedRequired(form, 'name', t('common.name')),
      description: flocalizedOrNull(form, 'description'),
      features: flocalizedList(form, 'features'),
      icon: fstr(form, 'icon')?.slice(0, 32) ?? null,
      priceMinor: fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price')),
      currency: fcurrency(form, 'currency'),
      entitlementKind: fenum(form, 'entitlementKind', ENTITLEMENT_KINDS, 'map_access'),
      durationDays,
      deviceLimit,
      maxMembers,
      canUseTrip: fbool(form, 'canUseTrip'),
      canSaveFavorites: fbool(form, 'canSaveFavorites'),
      canDownloadPdf: fbool(form, 'canDownloadPdf'),
      featured: fbool(form, 'featured'),
      sortOrder: fint(form, 'sortOrder', 0, t('common.order')),
      status,
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(plans).where(eq(plans.id, id)).limit(1))[0] ?? null)
      if (id !== 'new' && !before) throw new Error(t('plans.err_gone'))
      // Phase 6: without `prices.write` the price must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        before,
        values,
        before ? ['priceMinor', 'currency'] : ['priceMinor'],
        t('team.err_prices'),
      )

      const publishedAt =
        status === 'published' ? (before?.publishedAt ?? new Date()) : (before?.publishedAt ?? null)
      const [row] =
        id === 'new'
          ? await tx
              .insert(plans)
              .values({ ...values, publishedAt })
              .returning()
          : await tx
              .update(plans)
              .set({ ...values, publishedAt })
              .where(eq(plans.id, id))
              .returning()
      if (!row) throw new Error(t('plans.err_save_failed'))

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'plan.create' : 'plan.update',
          entityType: 'plan',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )
      return row.id
    })

    refreshPublic()
    target = adminHref(`/plans/${savedId}`)
    outcome = {
      ok: t('plans.ok_saved'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/** Archive (soft delete). Entitlements already granted from it are untouched. */
export async function archivePlan(id: string): Promise<void> {
  const session = await requireCapability('config.write')
  const { t } = await getAdminI18n()
  let outcome: ActionOutcome
  try {
    const [row] = await db
      .update(plans)
      .set({ deletedAt: new Date(), status: 'draft' })
      .where(eq(plans.id, id))
      .returning()
    if (!row) throw new Error(t('plans.err_gone'))
    await writeAudit({
      actor: session,
      action: 'plan.archive',
      entityType: 'plan',
      entityId: id,
      before: { status: 'published' },
      after: { archived: true },
    })
    refreshPublic()
    outcome = {
      ok: t('plans.ok_archived'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(LIST, outcome))
}
