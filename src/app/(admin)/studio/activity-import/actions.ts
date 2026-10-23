'use server'

/**
 * Bulk import of activities from the CSV template (client spec §15).
 * «Check» validates and reports every problem; «Import» checks again and,
 * only when nothing is wrong, writes the activities as DRAFTS marked «needs
 * review», with their packages, add-ons and questions. Nothing is published.
 */

import { inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

import { db } from '@/db'
import {
  activities,
  activityAddons,
  activityCategories,
  activityTiers,
  categories,
  regions,
} from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { validateImport, type ImportResult } from '@/lib/content/activity-import'

import { writeAudit } from '../../_lib/audit'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

export interface ImportState {
  checked: boolean
  imported: number
  errors: string[]
  summary: { activities: number; packages: number; addons: number; faq: number } | null
  message: string | null
}

const MAX_BYTES = 2 * 1024 * 1024

async function readCsv(form: FormData): Promise<string> {
  const file = form.get('file')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) throw new Error('size')
    return file.text()
  }
  const pasted = form.get('csv')
  return typeof pasted === 'string' ? pasted.slice(0, MAX_BYTES) : ''
}

async function check(csv: string): Promise<{
  result: ImportResult
  regionIds: Map<string, string>
  categoryIds: Map<string, string>
}> {
  const [slugRows, regionRows, categoryRows] = await Promise.all([
    db.select({ slug: activities.slug }).from(activities),
    db.select({ id: regions.id, key: regions.key }).from(regions),
    db.select({ id: categories.id, key: categories.key }).from(categories),
  ])
  const regionIds = new Map(regionRows.map((row) => [row.key, row.id]))
  const categoryIds = new Map(categoryRows.map((row) => [row.key, row.id]))
  const result = validateImport(csv, {
    slugs: new Set(slugRows.map((row) => row.slug)),
    regions: new Set(regionIds.keys()),
    categories: new Set(categoryIds.keys()),
  })
  return { result, regionIds, categoryIds }
}

export async function importActivities(_prev: ImportState, form: FormData): Promise<ImportState> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const mode = form.get('mode') === 'import' ? 'import' : 'check'
  try {
    const csv = await readCsv(form)
    if (csv.trim() === '') {
      return { checked: false, imported: 0, errors: [], summary: null, message: t('av2.imp_empty') }
    }
    const { result, regionIds, categoryIds } = await check(csv)
    const errors = result.errors.map((error) =>
      t('av2.imp_line', {
        line: error.line,
        message: t(`av2.imp_err_${error.code}`, { value: error.value ?? '' }),
      }),
    )
    const summary = {
      activities: result.activities.length,
      packages: result.activities.reduce((n, a) => n + a.packages.length, 0),
      addons: result.activities.reduce((n, a) => n + a.addons.length, 0),
      faq: result.activities.reduce((n, a) => n + a.faq.length, 0),
    }
    if (mode === 'check' || errors.length > 0 || result.activities.length === 0) {
      return {
        checked: true,
        imported: 0,
        errors,
        summary,
        message: errors.length > 0 ? t('av2.imp_fix_first') : t('av2.imp_ready'),
      }
    }
    // Prices come in with the packages: the same right as adding one by hand.
    const pricesAllowed = can(session.role, 'prices.write')

    const created = await db.transaction(async (tx) => {
      // Re-check inside the transaction: a slug taken since the check is refused.
      const taken = await tx
        .select({ slug: activities.slug })
        .from(activities)
        .where(
          inArray(
            activities.slug,
            result.activities.map((a) => a.slug),
          ),
        )
      if (taken.length > 0)
        throw new Error(t('av2.imp_err_exists', { value: taken[0]?.slug ?? '' }))
      let count = 0
      for (const item of result.activities) {
        const [row] = await tx
          .insert(activities)
          .values({
            slug: item.slug,
            name: item.name,
            regionId: regionIds.get(item.region) ?? null,
            primaryCategoryId: item.category ? (categoryIds.get(item.category) ?? null) : null,
            shortDescription: item.short,
            description: item.description,
            duration: item.duration,
            priceMinor: pricesAllowed ? item.priceMinor : 0,
            currency: item.currency,
            minGuests: item.minGuests,
            maxGuests: item.maxGuests,
            meetingPoint: item.meeting,
            meetingMapUrl: item.mapUrl,
            meetingLat: item.lat,
            meetingLng: item.lng,
            cancellationPolicy: item.cancellation,
            faq: item.faq,
            timeSlots: [],
            status: 'draft',
            needsReview: true,
          })
          .returning({ id: activities.id })
        if (!row) continue
        if (item.category && categoryIds.has(item.category)) {
          await tx
            .insert(activityCategories)
            .values({ activityId: row.id, categoryId: categoryIds.get(item.category) as string })
        }
        for (const [index, pkg] of item.packages.entries()) {
          await tx.insert(activityTiers).values({
            activityId: row.id,
            key: pkg.key,
            name: pkg.name,
            priceMinor: pricesAllowed ? pkg.priceMinor : 0,
            compareAtPriceMinor: pricesAllowed ? pkg.compareAtMinor : null,
            currency: item.currency,
            pricingMode: pkg.pricing,
            groupMax: pkg.pricing === 'per_group' ? pkg.groupMax : null,
            minGuests: pkg.minGuests,
            maxGuests: pkg.maxGuests,
            includes: pkg.includes,
            excludes: pkg.excludes,
            features: pkg.features,
            sortOrder: index,
            status: 'published',
            publishedAt: new Date(),
          })
        }
        for (const [index, addon] of item.addons.entries()) {
          await tx.insert(activityAddons).values({
            activityId: row.id,
            name: addon.name,
            priceMinor: pricesAllowed ? addon.priceMinor : 0,
            currency: item.currency,
            pricing: addon.pricing,
            maxQty:
              addon.pricing === 'per_qty' || addon.pricing === 'per_hour'
                ? (addon.maxQty ?? 1)
                : null,
            sortOrder: index,
          })
        }
        count++
      }
      await writeAudit(
        {
          actor: session,
          action: 'activity.import',
          entityType: 'activity',
          entityId: null,
          before: null,
          after: { slugs: result.activities.map((a) => a.slug), ...summary },
        },
        tx,
      )
      return count
    })
    revalidatePath('/[locale]/activities', 'page')
    return {
      checked: true,
      imported: created,
      errors: [],
      summary,
      message: t('av2.imp_done', { count: created }),
    }
  } catch (error) {
    const text =
      error instanceof Error && error.message === 'size' ? t('av2.imp_size') : errorMessage(error)
    return { checked: false, imported: 0, errors: [text], summary: null, message: null }
  }
}
