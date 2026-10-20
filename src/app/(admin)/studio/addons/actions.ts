'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activityAddonLinks, activityTiers, addonsLibrary } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fcurrencyOr,
  fenum,
  fint,
  fintOrNull,
  flocalizedOrNull,
  flocalizedRequired,
  fmoney,
  fuuidOrNull,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/addons')

function refreshPublic(): void {
  revalidatePath('/[locale]/activities/[slug]', 'page')
}

/** Create (`id = 'new'`) or update one extra of the library. */
export async function saveLibraryAddon(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let target = id === 'new' ? adminHref('/addons/new') : adminHref(`/addons/${id}`)
  let outcome: { ok: string } | { err: string }

  try {
    const priceMinor = fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price'))
    if (priceMinor < 0) throw new Error(t('activities.err_price_negative'))
    const pricing = fenum(
      form,
      'pricing',
      ['per_person', 'per_booking', 'per_qty'] as const,
      'per_booking',
    )
    const maxQty = fintOrNull(form, 'maxQty', t('addons.max_qty'))
    if (maxQty !== null && maxQty < 1) throw new Error(t('activities.err_addon_max_qty'))
    const values = {
      name: flocalizedRequired(form, 'name', t('addons.name')),
      description: flocalizedOrNull(form, 'description'),
      unitLabel: flocalizedOrNull(form, 'unitLabel'),
      imageId: fuuidOrNull(form, 'imageId', t('addons.image')),
      priceMinor,
      currency: fcurrency(form, 'currency'),
      pricing,
      maxQty: pricing === 'per_qty' ? (maxQty ?? 1) : null,
      available: fbool(form, 'available'),
      sortOrder: fint(form, 'sortOrder', 0, t('addons.sort_order')),
    }

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((
              await tx
                .select()
                .from(addonsLibrary)
                .where(and(eq(addonsLibrary.id, id), isNull(addonsLibrary.deletedAt)))
                .limit(1)
            )[0] ?? null)
      if (id !== 'new' && !before) throw new Error(t('addons.err_gone'))
      const [row] =
        id === 'new'
          ? await tx.insert(addonsLibrary).values(values).returning()
          : await tx
              .update(addonsLibrary)
              .set({ ...values, updatedAt: new Date() })
              .where(eq(addonsLibrary.id, id))
              .returning()
      if (!row) throw new Error(t('addons.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'addon_library.create' : 'addon_library.update',
          entityType: 'addon_library',
          entityId: row.id,
          before,
          after: row,
        },
        tx,
      )
      return row.id
    })
    target = adminHref(`/addons/${savedId}`)
    outcome = { ok: t('addons.ok_saved') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

/**
 * Soft delete: the extra leaves every activity (links removed, packages stop
 * including it). Carts that still name it are refused at checkout as unknown;
 * orders keep their frozen copy.
 */
export async function deleteLibraryAddon(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(addonsLibrary)
        .where(and(eq(addonsLibrary.id, id), isNull(addonsLibrary.deletedAt)))
        .limit(1)
      if (!before) throw new Error(t('addons.err_gone'))
      await tx
        .update(addonsLibrary)
        .set({ deletedAt: new Date(), available: false, updatedAt: new Date() })
        .where(eq(addonsLibrary.id, id))
      await tx.delete(activityAddonLinks).where(eq(activityAddonLinks.addonId, id))
      await tx
        .update(activityTiers)
        .set({
          includesAddons: sql`coalesce(${activityTiers.includesAddons}, '[]'::jsonb) - ${id}::text`,
          updatedAt: new Date(),
        })
        .where(sql`${activityTiers.includesAddons} @> ${JSON.stringify([id])}::jsonb`)
      await writeAudit(
        {
          actor: session,
          action: 'addon_library.delete',
          entityType: 'addon_library',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('addons.ok_deleted') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(LIST, outcome))
}
