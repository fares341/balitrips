'use server'

/**
 * Activity page v2 (client spec «Advanced 2 and 8»): duplicate an activity
 * or one of its packages as a draft, and start an activity's texts from a
 * content template.
 */

import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  activities,
  activityAddonLinks,
  activityAddons,
  activityCategories,
  activityImages,
  activityTags,
  activityTiers,
  tierIncludedActivities,
  tierSeasonalPrices,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { assertMayWritePrices } from '@/lib/auth/price-guard'
import { isTemplateKey, templateFill } from '@/lib/content/activity-templates'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** «Name (copy)» in every language that has a name. */
function copyName(name: Localized, suffix: Localized): Localized {
  const out = { ...name }
  for (const key of Object.keys(out) as (keyof Localized)[]) {
    if (out[key]) out[key] = `${out[key]} ${suffix[key] ?? suffix.en}`.slice(0, 200)
  }
  return out
}

/** A free slug `<base>-copy`, `<base>-copy-2`, … (128 characters at most). */
async function freeSlug(tx: Tx, base: string): Promise<string> {
  const stem = `${base.replace(/-copy(-\d+)?$/, '').slice(0, 110)}-copy`
  const taken = new Set(
    (
      await tx
        .select({ slug: activities.slug })
        .from(activities)
        .where(like(activities.slug, `${stem}%`))
    ).map((row) => row.slug),
  )
  if (!taken.has(stem)) return stem
  for (let n = 2; ; n++) if (!taken.has(`${stem}-${n}`)) return `${stem}-${n}`
}

function remap(ids: readonly string[] | null | undefined, map: ReadonlyMap<string, string>) {
  return (ids ?? []).map((id) => map.get(id) ?? id)
}

/**
 * A full copy as a new DRAFT with its own id and slug: texts, photos,
 * categories, tags, packages (with their seasons and included activities),
 * the activity's own add-ons and its library links. Package and add-on
 * references are rewritten to the copies. Bookings, reviews, availability and
 * supplier offers are not copied.
 */
export async function duplicateActivity(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let target = adminHref('/activities')
  let outcome: { ok: string } | { err: string }

  try {
    const newId = await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
        .limit(1)
      if (!source) throw new Error(t('activities.err_gone'))

      const slug = await freeSlug(tx, source.slug)
      const [last] = await tx
        .select({ sortOrder: activities.sortOrder })
        .from(activities)
        .orderBy(sql`${activities.sortOrder} desc`)
        .limit(1)
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        publishedAt: _p,
        ...fields
      } = source
      void [_id, _c, _u, _d, _p]
      const [copy] = await tx
        .insert(activities)
        .values({
          ...fields,
          slug,
          legacyId: null,
          mergedIntoId: null,
          name: copyName(source.name, { ar: '(نسخة)', en: '(copy)', id: '(salinan)' }),
          status: 'draft',
          showOnHome: false,
          isFeatured: false,
          // Same structure, but its own page: not listed until reviewed.
          needsReview: true,
          rating: null,
          reviewCount: 0,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        })
        .returning({ id: activities.id })
      if (!copy) throw new Error(t('activities.err_save_failed'))

      const [cats, tagRows, images] = await Promise.all([
        tx.select().from(activityCategories).where(eq(activityCategories.activityId, id)),
        tx.select().from(activityTags).where(eq(activityTags.activityId, id)),
        tx.select().from(activityImages).where(eq(activityImages.activityId, id)),
      ])
      if (cats.length > 0)
        await tx
          .insert(activityCategories)
          .values(cats.map((row) => ({ ...row, activityId: copy.id })))
      if (tagRows.length > 0)
        await tx
          .insert(activityTags)
          .values(tagRows.map((row) => ({ ...row, activityId: copy.id })))
      if (images.length > 0)
        await tx
          .insert(activityImages)
          .values(images.map((row) => ({ ...row, activityId: copy.id })))

      // Packages first (new ids), then add-ons, then the references between them.
      const tiers = await tx
        .select()
        .from(activityTiers)
        .where(and(eq(activityTiers.activityId, id), isNull(activityTiers.deletedAt)))
        .orderBy(asc(activityTiers.sortOrder))
      const tierMap = new Map<string, string>()
      for (const tier of tiers) {
        const { id: tierId, createdAt: _tc, updatedAt: _tu, deletedAt: _td, ...rest } = tier
        void [_tc, _tu, _td]
        const [row] = await tx
          .insert(activityTiers)
          .values({ ...rest, activityId: copy.id })
          .returning({ id: activityTiers.id })
        if (row) tierMap.set(tierId, row.id)
      }

      const addons = await tx
        .select()
        .from(activityAddons)
        .where(and(eq(activityAddons.activityId, id), isNull(activityAddons.deletedAt)))
      const addonMap = new Map<string, string>()
      for (const addon of addons) {
        const {
          id: addonId,
          createdAt: _ac,
          updatedAt: _au,
          deletedAt: _ad,
          requiresAddonId: _r,
          ...rest
        } = addon
        void [_ac, _au, _ad, _r]
        const [row] = await tx
          .insert(activityAddons)
          .values({
            ...rest,
            activityId: copy.id,
            onlyPackages: remap(addon.onlyPackages, tierMap),
          })
          .returning({ id: activityAddons.id })
        if (row) addonMap.set(addonId, row.id)
      }
      for (const addon of addons) {
        const newAddon = addonMap.get(addon.id)
        if (!newAddon) continue
        await tx
          .update(activityAddons)
          .set({
            requiresAddonId: addon.requiresAddonId
              ? (addonMap.get(addon.requiresAddonId) ?? null)
              : null,
            incompatibleWith: remap(addon.incompatibleWith, addonMap),
          })
          .where(eq(activityAddons.id, newAddon))
      }
      for (const tier of tiers) {
        const newTier = tierMap.get(tier.id)
        if (!newTier) continue
        await tx
          .update(activityTiers)
          .set({ includesAddons: remap(tier.includesAddons, addonMap) })
          .where(eq(activityTiers.id, newTier))
      }

      const tierIds = [...tierMap.keys()]
      if (tierIds.length > 0) {
        const [seasons, included] = await Promise.all([
          tx.select().from(tierSeasonalPrices).where(inArray(tierSeasonalPrices.tierId, tierIds)),
          tx
            .select()
            .from(tierIncludedActivities)
            .where(inArray(tierIncludedActivities.tierId, tierIds)),
        ])
        for (const season of seasons) {
          const { id: _sid, createdAt: _sc, updatedAt: _su, ...rest } = season
          void [_sid, _sc, _su]
          await tx
            .insert(tierSeasonalPrices)
            .values({ ...rest, tierId: tierMap.get(season.tierId) ?? season.tierId })
        }
        for (const row of included) {
          const { id: _iid, createdAt: _ic, updatedAt: _iu, ...rest } = row
          void [_iid, _ic, _iu]
          await tx
            .insert(tierIncludedActivities)
            .values({ ...rest, tierId: tierMap.get(row.tierId) ?? row.tierId })
        }
      }

      const links = await tx
        .select()
        .from(activityAddonLinks)
        .where(eq(activityAddonLinks.activityId, id))
      for (const link of links) {
        const { createdAt: _lc, updatedAt: _lu, ...rest } = link
        void [_lc, _lu]
        await tx.insert(activityAddonLinks).values({
          ...rest,
          activityId: copy.id,
          onlyPackages: remap(link.onlyPackages, tierMap),
        })
      }

      // Activity lines and FAQ tied to a package follow it to the copy.
      const scopedList = (list: unknown) =>
        Array.isArray(list)
          ? list.map((line: { pkg?: string }) =>
              line && typeof line.pkg === 'string' && tierMap.has(line.pkg)
                ? { ...line, pkg: tierMap.get(line.pkg) }
                : line,
            )
          : list
      await tx
        .update(activities)
        .set({
          included: scopedList(source.included) as typeof source.included,
          excluded: scopedList(source.excluded) as typeof source.excluded,
          suitableFor: scopedList(source.suitableFor) as typeof source.suitableFor,
          importantNotes: scopedList(source.importantNotes) as typeof source.importantNotes,
          faq: scopedList(source.faq) as typeof source.faq,
        })
        .where(eq(activities.id, copy.id))

      await writeAudit(
        {
          actor: session,
          action: 'activity.duplicate',
          entityType: 'activity',
          entityId: copy.id,
          before: null,
          after: { from: id, slug, packages: tiers.length, addons: addons.length },
        },
        tx,
      )
      return copy.id
    })
    target = adminHref(`/activities/${newId}`)
    outcome = { ok: t('av2.ok_duplicated') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}

/** A copy of one package as a draft, key `<key>-copy`, placed last. */
export async function duplicateActivityTier(activityId: string, tierId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const target = adminHref(`/activities/${activityId}?tab=packages`)
  let outcome: { ok: string } | { err: string }

  try {
    // A new package is a new price (same rule as «add package»).
    assertMayWritePrices(session.role, t('team.err_prices'))
    await db.transaction(async (tx) => {
      const [source] = await tx
        .select()
        .from(activityTiers)
        .where(
          and(
            eq(activityTiers.id, tierId),
            eq(activityTiers.activityId, activityId),
            isNull(activityTiers.deletedAt),
          ),
        )
        .limit(1)
      if (!source) throw new Error(t('activities.err_tier_gone'))
      const keys = new Set(
        (
          await tx
            .select({ key: activityTiers.key })
            .from(activityTiers)
            .where(eq(activityTiers.activityId, activityId))
        ).map((row) => row.key),
      )
      const stem = `${source.key.replace(/-copy(-\d+)?$/, '').slice(0, 54)}-copy`
      let key = stem
      for (let n = 2; keys.has(key); n++) key = `${stem}-${n}`
      const [last] = await tx
        .select({ sortOrder: activityTiers.sortOrder })
        .from(activityTiers)
        .where(eq(activityTiers.activityId, activityId))
        .orderBy(sql`${activityTiers.sortOrder} desc`)
        .limit(1)
      const {
        id: _id,
        createdAt: _c,
        updatedAt: _u,
        deletedAt: _d,
        publishedAt: _p,
        ...rest
      } = source
      void [_id, _c, _u, _d, _p]
      const [row] = await tx
        .insert(activityTiers)
        .values({
          ...rest,
          key,
          name: copyName(source.name, { ar: '(نسخة)', en: '(copy)', id: '(salinan)' }),
          isPopular: false,
          status: 'draft',
          sortOrder: (last?.sortOrder ?? -1) + 1,
        })
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity_tier.duplicate',
          entityType: 'activity_tier',
          entityId: row?.id ?? null,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('av2.ok_pkg_duplicated') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidatePath('/[locale]/activities/[slug]', 'page')
  redirect(withOutcome(target, outcome))
}

/**
 * Start an activity's texts from a template: fills only the lists that are
 * empty, and marks the activity «needs review» (publishing waits for it).
 */
export async function applyContentTemplate(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const target = adminHref(`/activities/${activityId}?tab=content`)
  let outcome: { ok: string } | { err: string }

  try {
    const key = String(form.get('template') ?? '')
    if (!isTemplateKey(key)) throw new Error(t('av2.err_template'))
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(activities)
        .where(and(eq(activities.id, activityId), isNull(activities.deletedAt)))
        .limit(1)
      if (!before) throw new Error(t('activities.err_gone'))
      const fill = templateFill(key, before)
      const [after] = await tx
        .update(activities)
        .set({ ...fill, contentTemplate: key, needsReview: true })
        .where(eq(activities.id, activityId))
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity.template',
          entityType: 'activity',
          entityId: activityId,
          before,
          after: after ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('av2.ok_template') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(target, outcome))
}
