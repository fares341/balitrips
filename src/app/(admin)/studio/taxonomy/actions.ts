'use server'

import { count, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import {
  activityCategories,
  articleCategories,
  activities,
  articles,
  categories,
  itineraryRegions,
  landmarks,
  mapPlaces,
  packageRegions,
  regions,
  tags,
} from '@/db/schema'
import { isIconName } from '@/components/ui/icon'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fenum,
  fint,
  flocalizedOrNull,
  flocalizedRequired,
  freq,
  fstr,
  fuuidOrNull,
} from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { assertSlug } from '../../_lib/slug'

const LIST = adminHref('/taxonomy')

const STATUSES = ['active', 'inactive'] as const

/** رقم عشري اختياري ضمن حدود، وإلا خطأ واضح. */
function optionalNumber(form: FormData, name: string, label: string, min: number, max: number) {
  const value = fstr(form, name)
  if (value === null) return null
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${label} must be a number between ${min} and ${max}`)
  }
  return parsed
}

type Outcome = { ok: string } | { err: string }

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveCategory(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    const icon = fstr(form, 'icon')
    if (icon && !isIconName(icon)) {
      // A category whose icon the set does not have renders as a hole in the
      // filter row, so reject it here rather than at paint time.
      throw new Error(`"${icon}" is not a name in the icon set.`)
    }

    const values = {
      key: assertSlug(freq(form, 'key', 'Key')).slice(0, 64),
      label: flocalizedRequired(form, 'label', 'Label'),
      description: flocalizedOrNull(form, 'description'),
      status: fenum(form, 'status', STATUSES, 'active'),
      icon,
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
    }

    await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(categories).where(eq(categories.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error('That category no longer exists')

      const [row] =
        id === 'new'
          ? await tx.insert(categories).values(values).returning()
          : await tx.update(categories).set(values).where(eq(categories.id, id)).returning()

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'category.create' : 'category.update',
          entityType: 'category',
          entityId: row?.id ?? null,
          before,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: 'Category saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteCategory(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(categories).where(eq(categories.id, id)).limit(1)
      if (!before) throw new Error('That category no longer exists')

      const [used] = await tx
        .select({ value: count() })
        .from(activityCategories)
        .where(eq(activityCategories.categoryId, id))

      // Taxonomy has no soft delete, so a delete here would cascade the join
      // rows away and silently un-categorise live activities.
      if ((used?.value ?? 0) > 0) {
        throw new Error(
          `${used?.value} activity/activities still use this category. Reassign them first.`,
        )
      }

      await tx.delete(categories).where(eq(categories.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'category.delete',
          entityType: 'category',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: 'Category deleted.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

// ---------------------------------------------------------------------------
// Regions
// ---------------------------------------------------------------------------

export async function saveRegion(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    const parentId = fuuidOrNull(form, 'parentId', 'Parent area')
    if (parentId !== null && parentId === id) throw new Error('An area cannot be its own parent')
    const values = {
      key: assertSlug(freq(form, 'key', 'Key')).slice(0, 64),
      label: flocalizedRequired(form, 'label', 'Label'),
      description: flocalizedOrNull(form, 'description'),
      status: fenum(form, 'status', STATUSES, 'active'),
      parentId,
      centerLat: optionalNumber(form, 'centerLat', 'Centre latitude', -9.2, -7.7),
      centerLon: optionalNumber(form, 'centerLon', 'Centre longitude', 114.4, 115.8),
      radiusKm: optionalNumber(form, 'radiusKm', 'Radius', 0.2, 80),
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
    }

    await db.transaction(async (tx) => {
      if (parentId !== null) {
        // مستويان فقط: الأب يجب أن يكون منطقة عامة بلا أب.
        const [parent] = await tx.select().from(regions).where(eq(regions.id, parentId)).limit(1)
        if (!parent) throw new Error('The parent area no longer exists')
        if (parent.parentId !== null) throw new Error('Pick a top-level region as the parent')
        if (id !== 'new') {
          const [child] = await tx
            .select({ id: regions.id })
            .from(regions)
            .where(eq(regions.parentId, id))
            .limit(1)
          if (child) {
            throw new Error('This region has neighbourhoods inside it, so it cannot be nested.')
          }
        }
      }
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(regions).where(eq(regions.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error('That region no longer exists')

      const [row] =
        id === 'new'
          ? await tx.insert(regions).values(values).returning()
          : await tx.update(regions).set(values).where(eq(regions.id, id)).returning()

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'region.create' : 'region.update',
          entityType: 'region',
          entityId: row?.id ?? null,
          before,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: 'Region saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteRegion(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(regions).where(eq(regions.id, id)).limit(1)
      if (!before) throw new Error('That region no longer exists')

      const counts = await Promise.all([
        tx.select({ value: count() }).from(activities).where(eq(activities.regionId, id)),
        tx.select({ value: count() }).from(landmarks).where(eq(landmarks.regionId, id)),
        tx.select({ value: count() }).from(mapPlaces).where(eq(mapPlaces.regionId, id)),
        tx
          .select({ value: count() })
          .from(itineraryRegions)
          .where(eq(itineraryRegions.regionId, id)),
        tx.select({ value: count() }).from(packageRegions).where(eq(packageRegions.regionId, id)),
      ])

      const used = counts.reduce((total, rows) => total + (rows[0]?.value ?? 0), 0)
      if (used > 0) {
        throw new Error(`${used} record(s) still reference this region. Reassign them first.`)
      }

      await tx.delete(regions).where(eq(regions.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'region.delete',
          entityType: 'region',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: 'Region deleted.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

// ---------------------------------------------------------------------------
// Article categories
// ---------------------------------------------------------------------------

export async function saveArticleCategory(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    const values = {
      key: assertSlug(freq(form, 'key', 'Key')).slice(0, 64),
      label: flocalizedRequired(form, 'label', 'Label'),
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
    }

    await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((
              await tx.select().from(articleCategories).where(eq(articleCategories.id, id)).limit(1)
            )[0] ?? null)

      if (id !== 'new' && !before) throw new Error('That article category no longer exists')

      const [row] =
        id === 'new'
          ? await tx.insert(articleCategories).values(values).returning()
          : await tx
              .update(articleCategories)
              .set(values)
              .where(eq(articleCategories.id, id))
              .returning()

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'article_category.create' : 'article_category.update',
          entityType: 'article_category',
          entityId: row?.id ?? null,
          before,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: 'Article category saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteArticleCategory(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(articleCategories)
        .where(eq(articleCategories.id, id))
        .limit(1)
      if (!before) throw new Error('That article category no longer exists')

      const [used] = await tx
        .select({ value: count() })
        .from(articles)
        .where(eq(articles.categoryId, id))

      if ((used?.value ?? 0) > 0) {
        throw new Error(`${used?.value} article(s) still use this category. Reassign them first.`)
      }

      await tx.delete(articleCategories).where(eq(articleCategories.id, id))

      await writeAudit(
        {
          actor: session,
          action: 'article_category.delete',
          entityType: 'article_category',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })

    outcome = { ok: 'Article category deleted.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/* --------------------------------------------------------------------------
   Map place tags (place_tags). Same shape as regions; deleting a tag removes
   it from every place (cascade) — the confirmation is the audit row.
   -------------------------------------------------------------------------- */

export async function saveTag(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    const values = {
      key: assertSlug(freq(form, 'key', 'Key')).slice(0, 64),
      label: flocalizedRequired(form, 'label', 'Label'),
      sortOrder: fint(form, 'sortOrder', 0, 'Sort order'),
    }

    await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(tags).where(eq(tags.id, id)).limit(1))[0] ?? null)
      if (id !== 'new' && !before) throw new Error('That tag no longer exists')

      const [row] =
        id === 'new'
          ? await tx.insert(tags).values(values).returning()
          : await tx.update(tags).set(values).where(eq(tags.id, id)).returning()

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'tag.create' : 'tag.update',
          entityType: 'tag',
          entityId: row?.id ?? null,
          before,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: 'Tag saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function deleteTag(id: string): Promise<void> {
  const session = await requireCapability('content.write')
  let outcome: Outcome

  try {
    await db.transaction(async (tx) => {
      const [before] = await tx.delete(tags).where(eq(tags.id, id)).returning()
      if (!before) throw new Error('That tag no longer exists')
      await writeAudit(
        {
          actor: session,
          action: 'tag.delete',
          entityType: 'tag',
          entityId: id,
          before,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: 'Tag deleted and removed from every place.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
