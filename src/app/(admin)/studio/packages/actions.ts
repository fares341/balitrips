'use server'

import { and, asc, eq, isNull } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activities, packageActivities, packageRegions, packages } from '@/db/schema'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fenum,
  fint,
  flines,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  fcurrencyOr,
  fmoney,
  fmulti,
  freq,
  fstr,
  fuuidOrNull,
  isUuid,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/packages')

type Outcome = { ok: string } | { err: string }

export async function savePackage(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/packages/${id}`)
  let outcome: Outcome

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'
    if (status === 'published') await requireCapability('content.publish')

    const values = {
      slug: assertSlug(freq(form, 'slug', t('packages.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('packages.f_name')),
      blurb: flocalizedOrNull(form, 'blurb'),
      days: fint(form, 'days', 1, t('packages.days')),
      maxGuests: fint(form, 'maxGuests', 1, t('packages.max_guests')),
      driverIncluded: fbool(form, 'driverIncluded'),
      priceMinor: fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price')),
      currency: fcurrency(form, 'currency'),
      // The prototype advertised "from $X" and then charged a flat X no
      // matter how many guests were entered. This makes the intent explicit
      // instead of leaving the contradiction in the renderer.
      pricingMode: fenum(form, 'pricingMode', ['flat', 'per_guest'] as const, 'flat'),
      amenities: flines(form, 'amenities'),
      included: flocalizedList(form, 'included'),
      excluded: flocalizedList(form, 'excluded'),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('packages.hero_image')),
      // Phase 3: an included itinerary, and VIP with the plan that defines it.
      itineraryId: fuuidOrNull(form, 'itineraryId', t('p3.pkg_itinerary')),
      includesVip: fbool(form, 'includesVip'),
      vipPlanId: fuuidOrNull(form, 'vipPlanId', t('p3.vip_plan')),
      status,
    }
    if (values.includesVip && values.vipPlanId === null) {
      throw new Error(t('p3.err_vip_plan_needed'))
    }

    if (values.days < 1) throw new Error(t('packages.err_days_min'))
    if (values.maxGuests < 1) throw new Error(t('packages.err_max_guests_min'))

    // Activities are edited in their own card (order, day) — see below.
    const regionIds = fmulti(form, 'regionIds')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(packages).where(eq(packages.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('packages.err_gone'))
      // Phase 6: without `prices.write` the price must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        before,
        values,
        before ? ['priceMinor', 'currency', 'pricingMode'] : ['priceMinor'],
        t('team.err_prices'),
      )

      const [row] =
        id === 'new'
          ? await tx
              .insert(packages)
              .values({ ...values, publishedAt: status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(packages)
              .set({
                ...values,
                publishedAt:
                  status === 'published'
                    ? (before?.publishedAt ?? new Date())
                    : (before?.publishedAt ?? null),
              })
              .where(eq(packages.id, id))
              .returning()

      if (!row) throw new Error(t('packages.err_save_failed'))

      await tx.delete(packageRegions).where(eq(packageRegions.packageId, row.id))
      if (regionIds.length > 0) {
        await tx
          .insert(packageRegions)
          .values(regionIds.map((regionId) => ({ packageId: row.id, regionId })))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'package.create' : 'package.update',
          entityType: 'package',
          entityId: row.id,
          before,
          after: { ...row, regionIds },
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/packages/${savedId}`)
    outcome = { ok: t('packages.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

export async function setPackageStatus(id: string, status: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const next = status === 'published' ? 'published' : 'draft'

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(packages).where(eq(packages.id, id)).limit(1)
      if (!before) throw new Error(t('packages.err_gone'))

      const [after] = await tx
        .update(packages)
        .set({
          status: next,
          publishedAt:
            next === 'published' ? (before.publishedAt ?? new Date()) : before.publishedAt,
        })
        .where(eq(packages.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: next === 'published' ? 'package.publish' : 'package.unpublish',
          entityType: 'package',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = {
      ok: next === 'published' ? t('packages.ok_published') : t('packages.ok_drafted'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deletePackage(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(packages).where(eq(packages.id, id)).limit(1)
      if (!before) throw new Error(t('packages.err_gone'))

      await tx
        .update(packages)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(packages.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'package.delete',
          entityType: 'package',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: t('packages.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

// ---------------------------------------------------------------------------
// Phase 3: the package's activities — order and day
// ---------------------------------------------------------------------------

const editorOf = (id: string) => adminHref(`/packages/${id}`)

/** "" = not fixed; "1".."60" = that day of the trip (stored 0-based). */
function dayOffsetFrom(form: FormData, name: string): number | null {
  const raw = form.get(name)
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const day = Number(raw)
  if (!Number.isInteger(day) || day < 1 || day > 60) return null
  return day - 1
}

export async function addPackageActivity(packageId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const activityId = fuuidOrNull(form, 'activityId', t('packages.f_activities'))
    if (activityId === null) throw new Error(t('p3.err_pick_activity'))
    const dayOffset = dayOffsetFrom(form, 'day')
    await db.transaction(async (tx) => {
      const [activity] = await tx
        .select({ id: activities.id })
        .from(activities)
        .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
        .limit(1)
      if (!activity) throw new Error(t('p3.err_pick_activity'))
      const existing = await tx
        .select({ activityId: packageActivities.activityId })
        .from(packageActivities)
        .where(eq(packageActivities.packageId, packageId))
      if (existing.some((row) => row.activityId === activityId)) {
        throw new Error(t('p3.err_activity_twice'))
      }
      await tx
        .insert(packageActivities)
        .values({ packageId, activityId, dayOffset, sortOrder: existing.length })
      await writeAudit(
        {
          actor: session,
          action: 'package.activity_add',
          entityType: 'package',
          entityId: packageId,
          before: null,
          after: { activityId, dayOffset },
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_activity_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editorOf(packageId), outcome))
}

export async function savePackageActivity(
  packageId: string,
  activityId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    const dayOffset = dayOffsetFrom(form, 'day')
    await db.transaction(async (tx) => {
      const changed = await tx
        .update(packageActivities)
        .set({ dayOffset })
        .where(
          and(
            eq(packageActivities.packageId, packageId),
            eq(packageActivities.activityId, activityId),
          ),
        )
        .returning({ activityId: packageActivities.activityId })
      if (changed.length === 0) throw new Error(t('p3.err_pick_activity'))
      await writeAudit(
        {
          actor: session,
          action: 'package.activity_day',
          entityType: 'package',
          entityId: packageId,
          before: null,
          after: { activityId, dayOffset },
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_activity_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editorOf(packageId), outcome))
}

export async function removePackageActivity(packageId: string, activityId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome
  try {
    await db.transaction(async (tx) => {
      await tx
        .delete(packageActivities)
        .where(
          and(
            eq(packageActivities.packageId, packageId),
            eq(packageActivities.activityId, activityId),
          ),
        )
      const rest = await tx
        .select({ activityId: packageActivities.activityId })
        .from(packageActivities)
        .where(eq(packageActivities.packageId, packageId))
        .orderBy(asc(packageActivities.sortOrder))
      for (const [index, row] of rest.entries()) {
        await tx
          .update(packageActivities)
          .set({ sortOrder: index })
          .where(
            and(
              eq(packageActivities.packageId, packageId),
              eq(packageActivities.activityId, row.activityId),
            ),
          )
      }
      await writeAudit(
        {
          actor: session,
          action: 'package.activity_remove',
          entityType: 'package',
          entityId: packageId,
          before: { activityId },
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('p3.ok_activity_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(editorOf(packageId), outcome))
}

/** New order of the package's activities (ids, first = first). */
export async function reorderPackageActivities(
  packageId: string,
  activityIds: string[],
): Promise<boolean> {
  const session = await requireCapability('content.write')
  if (!isUuid(packageId) || !Array.isArray(activityIds)) return false
  const ids = activityIds.filter((id) => typeof id === 'string' && isUuid(id))
  try {
    await db.transaction(async (tx) => {
      for (const [index, activityId] of ids.entries()) {
        await tx
          .update(packageActivities)
          .set({ sortOrder: index })
          .where(
            and(
              eq(packageActivities.packageId, packageId),
              eq(packageActivities.activityId, activityId),
            ),
          )
      }
      await writeAudit(
        {
          actor: session,
          action: 'package.activity_reorder',
          entityType: 'package',
          entityId: packageId,
          before: null,
          after: { order: ids },
        },
        tx,
      )
    })
    return true
  } catch {
    return false
  }
}
