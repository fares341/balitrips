/**
 * Server side of the v2 pre-publish checklist: loads what
 * `activityChecklist` needs for one activity. Used by the editor (to show
 * the list) and by the actions (to refuse going public while required items
 * are missing).
 */

import { and, count, eq, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { activities, activityCategories, activityImages, activityTiers } from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import {
  activityChecklist,
  missingForPublish,
  type ChecklistItem,
} from '@/lib/content/activity-checklist'

import type { Translate } from '../../_i18n'

type Executor = Pick<typeof db, 'select'>

/** The checklist of one activity; `override` = values about to be saved. */
export async function loadChecklist(
  executor: Executor,
  activityId: string,
  override: { regionId?: string | null; name?: Localized | null; categoryCount?: number } = {},
): Promise<ChecklistItem[] | null> {
  const [row] = await executor
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
    .limit(1)
  if (!row) return null
  const [[cats], [gallery], [tiers]] = await Promise.all([
    executor
      .select({ n: count() })
      .from(activityCategories)
      .where(eq(activityCategories.activityId, activityId)),
    executor
      .select({ n: count() })
      .from(activityImages)
      .where(eq(activityImages.activityId, activityId)),
    executor
      .select({ n: count() })
      .from(activityTiers)
      .where(
        and(
          eq(activityTiers.activityId, activityId),
          eq(activityTiers.status, 'published'),
          isNull(activityTiers.deletedAt),
        ),
      ),
  ])
  return activityChecklist({
    name: override.name !== undefined ? override.name : row.name,
    regionId: override.regionId !== undefined ? override.regionId : row.regionId,
    categoryCount:
      override.categoryCount !== undefined
        ? override.categoryCount
        : Math.max(cats?.n ?? 0, row.primaryCategoryId ? 1 : 0),
    heroImageId: row.heroImageId,
    description: row.description,
    shortDescription: row.shortDescription,
    priceMinor: row.priceMinor,
    packageCount: tiers?.n ?? 0,
    duration: row.duration,
    galleryCount: gallery?.n ?? 0,
    meetingPoint: row.meetingPoint,
    meetingMapUrl: row.meetingMapUrl,
    needsReview: row.needsReview,
  })
}

/** Throws a readable error listing what is missing before going public. */
export async function assertPublishable(
  executor: Executor,
  activityId: string,
  t: Translate,
  override: Parameters<typeof loadChecklist>[2] = {},
): Promise<void> {
  const items = await loadChecklist(executor, activityId, override)
  if (!items) throw new Error(t('activities.err_gone'))
  const missing = missingForPublish(items)
  if (missing.length > 0) {
    throw new Error(
      t('av2.err_checklist', { items: missing.map((key) => t(`av2.check_${key}`)).join('، ') }),
    )
  }
}
