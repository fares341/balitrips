'use server'

import { and, eq, isNull, sql } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { activities, activityAddons, activityCategories, activityTiers } from '@/db/schema'

import { adminHref } from '../../_lib/admin-path'
import { feventRange } from '../../_lib/bali-time'
import { writeAudit } from '../../_lib/audit'
import {
  fbool,
  fcurrency,
  fenum,
  ffaq,
  fint,
  fintOrNull,
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
} from '../../_lib/form'
import type { Translate } from '../../_i18n'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { assertSlug } from '../../_lib/slug'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/activities')

/** How many FAQ rows the editor posts back — see the editor's blank rows. */
const FAQ_ROWS = 12

export async function saveActivity(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()

  let target = id === 'new' ? LIST : adminHref(`/activities/${id}`)
  let outcome: { ok: string } | { err: string }

  try {
    const status = form.get('status') === 'published' ? 'published' : 'draft'

    // Publishing is a separate capability from editing: staff can write copy
    // and also publish, but the split exists so it can be tightened without
    // touching call sites.
    if (status === 'published') await requireCapability('content.publish')

    const values = {
      slug: assertSlug(freq(form, 'slug', t('activities.f_slug'))),
      legacyId: fstr(form, 'legacyId'),
      name: flocalizedRequired(form, 'name', t('activities.f_name')),
      area: flocalizedOrNull(form, 'area'),
      description: flocalizedOrNull(form, 'description'),
      duration: flocalizedOrNull(form, 'duration'),
      regionId: fuuidOrNull(form, 'regionId', t('activities.region')),
      priceMinor: fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price')),
      currency: fcurrency(form, 'currency'),
      rating: ratingFromTenths(form, t),
      reviewCount: fint(form, 'reviewCount', 0, t('activities.f_review_count')),
      heroImageId: fuuidOrNull(form, 'heroImageId', t('activities.hero_image')),
      included: flocalizedList(form, 'included'),
      excluded: flocalizedList(form, 'excluded'),
      faq: ffaq(form, 'faq', FAQ_ROWS),
      cancellationPolicy: flocalizedOrNull(form, 'cancellationPolicy'),
      timeSlots: normaliseTimeSlots(flines(form, 'timeSlots'), t),
      leadTimeHours: fint(form, 'leadTimeHours', 24, t('activities.lead_time')),
      maxGuests: fint(form, 'maxGuests', 20, t('activities.max_guests')),
      multiDay: fbool(form, 'multiDay'),
      sortOrder: fint(form, 'sortOrder', 0, t('activities.sort_order')),
      // Dated events (category "events") — the Events page orders and expires by these.
      ...feventRange(form, {
        start: t('activities.f_event_starts'),
        end: t('activities.f_event_ends'),
      }),
      status,
    }

    if (values.leadTimeHours < 0) throw new Error(t('activities.err_lead_time_negative'))
    if (values.maxGuests < 1) throw new Error(t('activities.err_max_guests_min'))

    const categoryIds = fmulti(form, 'categoryIds')

    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(activities).where(eq(activities.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('activities.err_gone'))

      // publishedAt is set the first time it goes live and never reset by a
      // later edit — it is the date the page entered the index.
      const publishedAt =
        values.status === 'published' ? (before?.publishedAt ?? new Date()) : before?.publishedAt

      const [row] =
        id === 'new'
          ? await tx
              .insert(activities)
              .values({ ...values, publishedAt: values.status === 'published' ? new Date() : null })
              .returning()
          : await tx
              .update(activities)
              .set({ ...values, publishedAt: publishedAt ?? null })
              .where(eq(activities.id, id))
              .returning()

      if (!row) throw new Error(t('activities.err_save_failed'))

      await tx.delete(activityCategories).where(eq(activityCategories.activityId, row.id))
      if (categoryIds.length > 0) {
        await tx
          .insert(activityCategories)
          .values(categoryIds.map((categoryId) => ({ activityId: row.id, categoryId })))
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'activity.create' : 'activity.update',
          entityType: 'activity',
          entityId: row.id,
          before,
          after: { ...row, categoryIds },
        },
        tx,
      )

      return row.id
    })

    target = adminHref(`/activities/${savedId}`)
    outcome = { ok: t('activities.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/** Quick publish / unpublish from the list, without opening the editor. */
export async function setActivityStatus(id: string, status: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const next = status === 'published' ? 'published' : 'draft'

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1)
      if (!before) throw new Error(t('activities.err_gone'))

      const [after] = await tx
        .update(activities)
        .set({
          status: next,
          publishedAt:
            next === 'published' ? (before.publishedAt ?? new Date()) : before.publishedAt,
        })
        .where(eq(activities.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: next === 'published' ? 'activity.publish' : 'activity.unpublish',
          entityType: 'activity',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = {
      ok: status === 'published' ? t('activities.ok_published') : t('activities.ok_drafted'),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * Soft delete only.
 *
 * An activity referenced by a paid order must never hard-delete: the order's
 * line snapshot keeps the name and price, but the row is still the anchor
 * for reviews, day plans and reporting.
 */
export async function deleteActivity(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1)
      if (!before) throw new Error(t('activities.err_gone'))

      await tx
        .update(activities)
        .set({ deletedAt: new Date(), status: 'draft' })
        .where(eq(activities.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'activity.delete',
          entityType: 'activity',
          entityId: id,
          before,
          after: { deletedAt: new Date().toISOString(), status: 'draft' },
        },
        tx,
      )
    })

    outcome = { ok: t('activities.ok_archived') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * Rating is stored as a `real` but authored as tenths, so an operator types
 * 47 for 4.7 and cannot introduce a float that renders as 4.699999.
 */
function ratingFromTenths(form: FormData, t: Translate): number | null {
  const tenths = fintOrNull(form, 'ratingTenths', t('activities.f_rating_short'))
  if (tenths === null) return null
  if (tenths < 0 || tenths > 50) throw new Error(t('activities.err_rating_range'))
  return tenths / 10
}

/**
 * Bookable start times, normalised to HH:mm and sorted.
 *
 * The prototype hard-coded 09:00/11:30/14:00/16:30 for every activity; these
 * are per-activity and are what the booking engine and lead-time rule read.
 */
function normaliseTimeSlots(lines: readonly string[], t: Translate): string[] {
  const out: string[] = []
  for (const line of lines) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(line)
    if (!match) throw new Error(t('activities.err_time_format', { value: line }))
    const hours = Number(match[1])
    const minutes = Number(match[2])
    if (hours > 23 || minutes > 59)
      throw new Error(t('activities.err_time_invalid', { value: line }))
    out.push(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`)
  }
  return [...new Set(out)].sort()
}

// ---------------------------------------------------------------------------
// Service tiers
// ---------------------------------------------------------------------------

/**
 * Tiers are edited on the activity's own page rather than in a section of
 * their own, because a tier has no meaning away from its activity: a "Premium"
 * row in a global list would say nothing about which tour it belongs to, and
 * the first question anyone asks of a price is "of what?".
 */
const tierEditor = (activityId: string) => adminHref(`/activities/${activityId}`)

/** Ids posted from a checklist that must all be rows of this activity. */
async function ownIds(
  form: FormData,
  name: string,
  allowed: readonly string[],
  t: Translate,
): Promise<string[]> {
  const ids = [...new Set(fmulti(form, name))]
  for (const id of ids) {
    if (!allowed.includes(id)) throw new Error(t('activities.err_foreign_ref'))
  }
  return ids
}

async function addonIdsOf(activityId: string): Promise<string[]> {
  const rows = await db
    .select({ id: activityAddons.id })
    .from(activityAddons)
    .where(and(eq(activityAddons.activityId, activityId), isNull(activityAddons.deletedAt)))
  return rows.map((row) => row.id)
}

async function tierValuesFrom(form: FormData, t: Translate, activityId: string) {
  const priceMinor = fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price'))
  if (priceMinor < 0) throw new Error(t('activities.err_price_negative'))

  const maxGuests = fintOrNull(form, 'maxGuests', t('activities.max_guests'))
  if (maxGuests !== null && maxGuests < 1) throw new Error(t('activities.err_max_guests_min'))

  const pricingMode = fenum(form, 'pricingMode', ['per_person', 'per_group'] as const, 'per_person')
  const groupMax = fintOrNull(form, 'groupMax', t('activities.group_max'))
  if (pricingMode === 'per_group' && (groupMax === null || groupMax < 1)) {
    throw new Error(t('activities.err_group_max'))
  }

  return {
    name: flocalizedRequired(form, 'name', t('activities.tier_name')),
    tagline: flocalizedOrNull(form, 'tagline'),
    priceMinor,
    currency: fcurrency(form, 'currency'),
    pricingMode,
    groupMax: pricingMode === 'per_group' ? groupMax : null,
    maxGuests,
    includes: flocalizedList(form, 'includes'),
    excludes: flocalizedList(form, 'excludes'),
    includesAddons: await ownIds(form, 'includesAddons', await addonIdsOf(activityId), t),
    available: fbool(form, 'available'),
    isPopular: fbool(form, 'isPopular'),
    features: flocalizedList(form, 'features'),
    highlights: flocalizedList(form, 'highlights'),
    details: flocalizedList(form, 'details'),
    notes: flocalizedList(form, 'notes'),
    status: form.get('status') === 'published' ? 'published' : 'draft',
  }
}

/**
 * At most one tier per activity may wear the "most popular" ribbon.
 *
 * Enforced here rather than trusted to the operator: four ribbons is not a
 * stronger recommendation, it is a page that looks broken, and the mistake is
 * invisible in a form that edits one tier at a time.
 */
async function clearOtherPopular(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  activityId: string,
  keepId: string,
): Promise<void> {
  await tx
    .update(activityTiers)
    .set({ isPopular: false, updatedAt: new Date() })
    .where(and(eq(activityTiers.activityId, activityId), sql`${activityTiers.id} <> ${keepId}`))
}

export async function addActivityTier(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const values = await tierValuesFrom(form, t, activityId)
    const key = assertSlug(freq(form, 'key', t('activities.tier_key')))

    await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ sortOrder: activityTiers.sortOrder })
        .from(activityTiers)
        .where(eq(activityTiers.activityId, activityId))
        .orderBy(sql`${activityTiers.sortOrder} desc`)
        .limit(1)

      const [row] = await tx
        .insert(activityTiers)
        .values({
          activityId,
          key,
          ...values,
          sortOrder: (last?.sortOrder ?? -1) + 1,
          publishedAt: values.status === 'published' ? new Date() : null,
        })
        .returning()

      if (row && values.isPopular) await clearOtherPopular(tx, activityId, row.id)

      await writeAudit(
        {
          actor: session,
          action: 'activity_tier.create',
          entityType: 'activity_tier',
          entityId: row?.id ?? null,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('activities.ok_tier_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}

/** الفئة داخل نشاطها، وغير محذوفة — لا تُعدَّل فئة نشاط آخر ولا فئة محذوفة. */
const tierOf = (activityId: string, tierId: string) =>
  and(
    eq(activityTiers.id, tierId),
    eq(activityTiers.activityId, activityId),
    isNull(activityTiers.deletedAt),
  )

export async function saveActivityTier(
  activityId: string,
  tierId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const values = await tierValuesFrom(form, t, activityId)

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activityTiers)
        .where(tierOf(activityId, tierId))
        .limit(1)
      if (!before) throw new Error(t('activities.err_tier_gone'))

      const [row] = await tx
        .update(activityTiers)
        .set({
          ...values,
          publishedAt: values.status === 'published' ? (before.publishedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(tierOf(activityId, tierId))
        .returning()

      if (values.isPopular) await clearOtherPopular(tx, activityId, tierId)

      await writeAudit(
        {
          actor: session,
          action: 'activity_tier.update',
          entityType: 'activity_tier',
          entityId: tierId,
          before,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('activities.ok_tier_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}

/**
 * Soft delete, like every other content row.
 *
 * A cart or an order may already reference this tier. Hard-deleting it would
 * break the price lookup on a line someone is midway through buying, and
 * erase what an existing order was actually sold.
 */
export async function removeActivityTier(activityId: string, tierId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activityTiers)
        .where(tierOf(activityId, tierId))
        .limit(1)
      if (!before) throw new Error(t('activities.err_tier_gone'))

      await tx
        .update(activityTiers)
        .set({ deletedAt: new Date(), status: 'draft', updatedAt: new Date() })
        .where(tierOf(activityId, tierId))

      await writeAudit(
        {
          actor: session,
          action: 'activity_tier.delete',
          entityType: 'activity_tier',
          entityId: tierId,
          before,
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: t('activities.ok_tier_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}

// ---------------------------------------------------------------------------
// Add-ons
// ---------------------------------------------------------------------------

/**
 * Optional extras of one activity (handoff "Addon"). Edited beside the
 * packages because their rules point at them: `only_packages` lists package
 * ids and a package's `includes_addons` lists add-on ids. Every reference is
 * checked to belong to this same activity, and `requires` may not loop.
 */
async function addonValuesFrom(
  form: FormData,
  t: Translate,
  activityId: string,
  selfId: string | null,
) {
  const priceMinor = fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price'))
  if (priceMinor < 0) throw new Error(t('activities.err_price_negative'))

  const pricing = fenum(
    form,
    'pricing',
    ['per_person', 'per_booking', 'per_qty'] as const,
    'per_booking',
  )
  const maxQty = fintOrNull(form, 'maxQty', t('activities.addon_max_qty'))
  if (maxQty !== null && maxQty < 1) throw new Error(t('activities.err_addon_max_qty'))

  const tierRows = await db
    .select({ id: activityTiers.id })
    .from(activityTiers)
    .where(and(eq(activityTiers.activityId, activityId), isNull(activityTiers.deletedAt)))
  const onlyPackages = await ownIds(
    form,
    'onlyPackages',
    tierRows.map((row) => row.id),
    t,
  )

  const addonRows = await db
    .select({ id: activityAddons.id, requiresAddonId: activityAddons.requiresAddonId })
    .from(activityAddons)
    .where(and(eq(activityAddons.activityId, activityId), isNull(activityAddons.deletedAt)))
  const requiresAddonId = fuuidOrNull(form, 'requiresAddonId', t('activities.addon_requires'))
  if (requiresAddonId !== null) {
    if (requiresAddonId === selfId || !addonRows.some((row) => row.id === requiresAddonId)) {
      throw new Error(t('activities.err_foreign_ref'))
    }
    // Walk the chain from the prerequisite: reaching this add-on is a loop.
    const next = new Map(addonRows.map((row) => [row.id, row.requiresAddonId]))
    let cursor: string | null | undefined = requiresAddonId
    for (let hops = 0; cursor && hops <= addonRows.length; hops++) {
      if (cursor === selfId) throw new Error(t('activities.err_addon_loop'))
      cursor = next.get(cursor)
    }
  }

  return {
    name: flocalizedRequired(form, 'name', t('activities.addon_name')),
    description: flocalizedOrNull(form, 'description'),
    priceMinor,
    currency: fcurrency(form, 'currency'),
    pricing,
    maxQty: pricing === 'per_qty' ? (maxQty ?? 1) : null,
    onlyPackages,
    requiresAddonId,
    available: fbool(form, 'available'),
    sortOrder: fint(form, 'sortOrder', 0, t('activities.sort_order')),
  }
}

const addonOf = (activityId: string, addonId: string) =>
  and(
    eq(activityAddons.id, addonId),
    eq(activityAddons.activityId, activityId),
    isNull(activityAddons.deletedAt),
  )

export async function addActivityAddon(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const values = await addonValuesFrom(form, t, activityId, null)
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(activityAddons)
        .values({ activityId, ...values })
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity_addon.create',
          entityType: 'activity_addon',
          entityId: row?.id ?? null,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('activities.ok_addon_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}

export async function saveActivityAddon(
  activityId: string,
  addonId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const values = await addonValuesFrom(form, t, activityId, addonId)
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activityAddons)
        .where(addonOf(activityId, addonId))
        .limit(1)
      if (!before) throw new Error(t('activities.err_addon_gone'))
      const [row] = await tx
        .update(activityAddons)
        .set({ ...values, updatedAt: new Date() })
        .where(addonOf(activityId, addonId))
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity_addon.update',
          entityType: 'activity_addon',
          entityId: addonId,
          before,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('activities.ok_addon_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}

/**
 * Soft delete. A cart line may still name this add-on; checkout then refuses
 * it as unknown rather than charging for something withdrawn. Dependants
 * lose their requirement and packages stop including it.
 */
export async function removeActivityAddon(activityId: string, addonId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activityAddons)
        .where(addonOf(activityId, addonId))
        .limit(1)
      if (!before) throw new Error(t('activities.err_addon_gone'))
      await tx
        .update(activityAddons)
        .set({ deletedAt: new Date(), available: false, updatedAt: new Date() })
        .where(addonOf(activityId, addonId))
      await tx
        .update(activityAddons)
        .set({ requiresAddonId: null, updatedAt: new Date() })
        .where(
          and(
            eq(activityAddons.activityId, activityId),
            eq(activityAddons.requiresAddonId, addonId),
          ),
        )
      await tx
        .update(activityTiers)
        .set({
          includesAddons: sql`coalesce(${activityTiers.includesAddons}, '[]'::jsonb) - ${addonId}::text`,
          updatedAt: new Date(),
        })
        .where(eq(activityTiers.activityId, activityId))
      await writeAudit(
        {
          actor: session,
          action: 'activity_addon.delete',
          entityType: 'activity_addon',
          entityId: addonId,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('activities.ok_addon_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(tierEditor(activityId), outcome))
}
