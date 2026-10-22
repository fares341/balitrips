'use server'

import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
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
  addonsLibrary,
  tierIncludedActivities,
} from '@/db/schema'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'
import { can } from '@/lib/auth/roles'
import { activityStatus, isPublicStatus } from '@/lib/content/activity-status'
import { parseVideoUrl } from '@/lib/content/video'
import { queueAvailabilityAlerts } from '@/lib/notify/availability'

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
  ffloatOrNull,
  flocalizedList,
  flocalizedOrNull,
  flocalizedRequired,
  flocalizedRows,
  fcurrencyOr,
  fmoney,
  fmoneyOrNull,
  fmulti,
  freq,
  fstr,
  fuuid,
  fuuidOrNull,
  isUuid,
} from '../../_lib/form'
import type { Translate } from '../../_i18n'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { assertSlug } from '../../_lib/slug'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/activities')

/** How many FAQ rows the editor posts back — see the editor's blank rows. */
const FAQ_ROWS = 30

/** The editor's sections that post the activity form (the others have their own forms). */
type ActivitySection = 'basics' | 'content' | 'media' | 'booking' | 'faq'

const SECTIONS: readonly ActivitySection[] = ['basics', 'content', 'media', 'booking', 'faq']

/** Public pages that show activities, refreshed after an edit. */
function refreshPublic(): void {
  revalidatePath('/[locale]/activities/[slug]', 'page')
  revalidatePath('/[locale]/activities', 'page')
  revalidatePath('/[locale]', 'page')
}

function sectionHref(id: string, section: string): string {
  return adminHref(`/activities/${id}${section === 'basics' ? '' : `?tab=${section}`}`)
}

/** The columns one section of the editor owns, read from its form. */
async function sectionValues(
  section: ActivitySection,
  form: FormData,
  t: Translate,
): Promise<Partial<typeof activities.$inferInsert>> {
  switch (section) {
    case 'basics': {
      const status = activityStatus(String(form.get('status') ?? 'draft'))
      // Publishing (and the link-only / unavailable states, which are public
      // too) is a separate capability from editing.
      if (isPublicStatus(status)) await requireCapability('content.publish')
      return {
        slug: assertSlug(freq(form, 'slug', t('activities.f_slug'))),
        legacyId: fstr(form, 'legacyId'),
        name: flocalizedRequired(form, 'name', t('activities.f_name')),
        area: flocalizedOrNull(form, 'area'),
        duration: flocalizedOrNull(form, 'duration'),
        regionId: fuuidOrNull(form, 'regionId', t('activities.region')),
        priceMinor: fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price')),
        currency: fcurrency(form, 'currency'),
        primaryCategoryId: fuuidOrNull(form, 'primaryCategoryId', t('ae.primary_category')),
        isFeatured: fbool(form, 'isFeatured'),
        isMostPopular: fbool(form, 'isMostPopular'),
        showOnHome: fbool(form, 'showOnHome'),
        status,
      }
    }
    case 'content':
      return {
        headline: flocalizedOrNull(form, 'headline'),
        shortDescription: flocalizedOrNull(form, 'shortDescription'),
        description: flocalizedOrNull(form, 'description'),
        highlights: flocalizedRows(form, 'highlights'),
        suitableFor: flocalizedRows(form, 'suitableFor'),
        importantNotes: flocalizedRows(form, 'importantNotes'),
        included: flocalizedRows(form, 'included'),
        excluded: flocalizedRows(form, 'excluded'),
      }
    case 'media': {
      const raw = fstr(form, 'videoUrl')
      const video = raw === null ? null : parseVideoUrl(raw)
      if (raw !== null && video === null) throw new Error(t('ae.err_video'))
      return {
        heroImageId: fuuidOrNull(form, 'heroImageId', t('activities.hero_image')),
        mobileHeroImageId: fuuidOrNull(form, 'mobileHeroImageId', t('ae.mobile_hero')),
        videoUrl: video?.watchUrl ?? null,
      }
    }
    case 'booking': {
      const maxGuests = fint(form, 'maxGuests', 20, t('activities.max_guests'))
      const minGuests = fint(form, 'minGuests', 1, t('ae.min_guests'))
      const leadTimeHours = fint(form, 'leadTimeHours', 24, t('activities.lead_time'))
      if (leadTimeHours < 0) throw new Error(t('activities.err_lead_time_negative'))
      if (maxGuests < 1) throw new Error(t('activities.err_max_guests_min'))
      if (minGuests < 1 || minGuests > maxGuests) throw new Error(t('ae.err_min_guests'))
      const lat = ffloatOrNull(form, 'meetingLat', t('ae.meeting_lat'))
      const lng = ffloatOrNull(form, 'meetingLng', t('ae.meeting_lng'))
      if ((lat === null) !== (lng === null)) throw new Error(t('ae.err_lat_lng'))
      if (lat !== null && (lat < -90 || lat > 90)) throw new Error(t('ae.err_lat_lng'))
      if (lng !== null && (lng < -180 || lng > 180)) throw new Error(t('ae.err_lat_lng'))
      const mapUrl = fstr(form, 'meetingMapUrl')
      if (mapUrl !== null && !/^https:\/\/\S+$/i.test(mapUrl)) throw new Error(t('ae.err_map_url'))
      const freeHours = fintOrNull(form, 'freeCancellationHours', t('ae.free_cancel_hours'))
      if (freeHours !== null && (freeHours < 1 || freeHours > 720)) {
        throw new Error(t('ae.err_free_cancel'))
      }
      return {
        timeSlots: normaliseTimeSlots(flines(form, 'timeSlots'), t),
        leadTimeHours,
        maxGuests,
        minGuests,
        multiDay: fbool(form, 'multiDay'),
        // Dated events (category "events") — the Events page orders and expires by these.
        ...feventRange(form, {
          start: t('activities.f_event_starts'),
          end: t('activities.f_event_ends'),
        }),
        meetingPoint: flocalizedOrNull(form, 'meetingPoint'),
        meetingLat: lat,
        meetingLng: lng,
        meetingMapUrl: mapUrl,
        meetingTimeNote: flocalizedOrNull(form, 'meetingTimeNote'),
        whatToBring: flocalizedRows(form, 'whatToBring'),
        ageConditions: flocalizedRows(form, 'ageConditions'),
        instantConfirmation: fbool(form, 'instantConfirmation'),
        freeCancellationHours: freeHours,
        cancellationPolicy: flocalizedOrNull(form, 'cancellationPolicy'),
      }
    }
    case 'faq':
      return { faq: ffaq(form, 'faq', FAQ_ROWS) }
  }
}

/**
 * Save one section of the activity editor. A new activity starts with the
 * basic details; every other section updates only its own columns, so the
 * editor can be split into tabs without one tab clearing another's fields.
 */
export async function saveActivity(id: string, sectionRaw: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const section: ActivitySection = (SECTIONS as readonly string[]).includes(sectionRaw)
    ? (sectionRaw as ActivitySection)
    : 'basics'

  let target = id === 'new' ? adminHref('/activities/new') : sectionHref(id, section)
  let outcome: { ok: string } | { err: string }

  try {
    if (id === 'new' && section !== 'basics') throw new Error(t('ae.new_first'))
    const values = await sectionValues(section, form, t)

    // Basics also carry the categories and tags; the main category is always
    // one of the categories.
    const categoryIds =
      section === 'basics'
        ? [
            ...new Set([
              ...(values.primaryCategoryId ? [values.primaryCategoryId] : []),
              ...fmulti(form, 'categoryIds'),
            ]),
          ]
        : null
    const tagIds = section === 'basics' ? [...new Set(fmulti(form, 'tagIds'))] : null
    const galleryIds = section === 'media' ? [...new Set(fmulti(form, 'galleryIds'))] : null

    let republished: string | null = null
    const savedId = await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((await tx.select().from(activities).where(eq(activities.id, id)).limit(1))[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('activities.err_gone'))
      // The "from" price lives on the basics tab: without `prices.write` it
      // must come back as stored (a new activity: no price).
      if (section === 'basics') {
        assertPriceChangeAllowed(
          session.role,
          before,
          values,
          before ? ['priceMinor', 'currency'] : ['priceMinor'],
          t('team.err_prices'),
        )
      }

      let row: typeof activities.$inferSelect | undefined
      if (id === 'new') {
        // A new activity goes to the end of the list.
        const [last] = await tx
          .select({ sortOrder: activities.sortOrder })
          .from(activities)
          .orderBy(sql`${activities.sortOrder} desc`)
          .limit(1)
        const status = activityStatus(values.status)
        ;[row] = await tx
          .insert(activities)
          .values({
            ...(values as typeof activities.$inferInsert),
            sortOrder: (last?.sortOrder ?? -1) + 1,
            timeSlots: [],
            publishedAt: isPublicStatus(status) ? new Date() : null,
          })
          .returning()
      } else {
        // publishedAt is set the first time it goes public and never reset by a
        // later edit — it is the date the page entered the index.
        const status = section === 'basics' ? activityStatus(values.status) : null
        const publishedAt =
          status !== null && isPublicStatus(status)
            ? (before?.publishedAt ?? new Date())
            : before?.publishedAt
        ;[row] = await tx
          .update(activities)
          .set({ ...values, publishedAt: publishedAt ?? null })
          .where(eq(activities.id, id))
          .returning()
      }

      if (!row) throw new Error(t('activities.err_save_failed'))

      if (categoryIds !== null) {
        await tx.delete(activityCategories).where(eq(activityCategories.activityId, row.id))
        if (categoryIds.length > 0) {
          await tx
            .insert(activityCategories)
            .values(categoryIds.map((categoryId) => ({ activityId: row.id, categoryId })))
        }
      }
      if (tagIds !== null) {
        await tx.delete(activityTags).where(eq(activityTags.activityId, row.id))
        if (tagIds.length > 0) {
          await tx
            .insert(activityTags)
            .values(tagIds.map((tagId) => ({ activityId: row.id, tagId })))
        }
      }
      if (galleryIds !== null) {
        await tx.delete(activityImages).where(eq(activityImages.activityId, row.id))
        if (galleryIds.length > 0) {
          await tx.insert(activityImages).values(
            galleryIds.map((mediaId, index) => ({
              activityId: row.id,
              mediaId,
              sortOrder: index,
            })),
          )
        }
      }

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'activity.create' : 'activity.update',
          entityType: 'activity',
          entityId: row.id,
          before,
          after: {
            ...row,
            ...(categoryIds !== null ? { categoryIds } : {}),
            ...(tagIds !== null ? { tagIds } : {}),
            ...(galleryIds !== null ? { galleryIds } : {}),
          },
        },
        tx,
      )

      if (before && before.status !== 'published' && row.status === 'published') {
        republished = row.id
      }
      return row.id
    })

    // «أبلغني عند التوفر»: back on sale → alert everyone waiting, once each.
    if (republished) await queueAvailabilityAlerts(republished)

    target = sectionHref(savedId, section)
    outcome = { ok: t('activities.ok_saved') }
    refreshPublic()
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(target, outcome))
}

/**
 * New order of activities after a drag in the list. The rows keep the
 * positions they had among themselves (their old sort values, reassigned in
 * the new order), so reordering a filtered page never jumps a row past
 * activities that are not on it.
 */
export async function reorderActivities(ids: string[]): Promise<boolean> {
  const session = await requireCapability('content.write')
  const wanted = [...new Set(ids.filter((value) => isUuid(value)))].slice(0, 200)
  if (wanted.length < 2) return true
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: activities.id, sortOrder: activities.sortOrder })
        .from(activities)
        .where(and(inArray(activities.id, wanted), isNull(activities.deletedAt)))
      if (rows.length !== wanted.length) throw new Error('unknown activity')
      const slots = slotsFor(rows.map((row) => row.sortOrder))
      for (const [index, id] of wanted.entries()) {
        await tx
          .update(activities)
          .set({ sortOrder: slots[index] ?? index })
          .where(eq(activities.id, id))
      }
      await writeAudit(
        {
          actor: session,
          action: 'activity.reorder',
          entityType: 'activity',
          entityId: null,
          before: { order: rows.map((row) => row.id) },
          after: { order: wanted },
        },
        tx,
      )
    })
    refreshPublic()
    return true
  } catch (error) {
    console.error('[reorderActivities]', error)
    return false
  }
}

/**
 * The sort values to hand out, top first: the rows' own values sorted, made
 * strictly increasing (several rows may share 0 before anyone ordered them).
 */
function slotsFor(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const value of sorted) {
    const previous = out[out.length - 1]
    out.push(previous !== undefined && value <= previous ? previous + 1 : value)
  }
  return out
}

/** Quick publish / unpublish from the list, without opening the editor. */
export async function setActivityStatus(id: string, status: string): Promise<void> {
  const session = await requireCapability('content.publish')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }

  try {
    const next = status === 'published' ? 'published' : 'draft'

    let republished = false
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(activities).where(eq(activities.id, id)).limit(1)
      if (!before) throw new Error(t('activities.err_gone'))
      republished = before.status !== 'published' && next === 'published'

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

    if (republished) await queueAvailabilityAlerts(id)

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
const tierEditor = (activityId: string) => adminHref(`/activities/${activityId}?tab=packages`)
const addonEditor = (activityId: string) => adminHref(`/activities/${activityId}?tab=addons`)
const includedEditor = (activityId: string) => adminHref(`/activities/${activityId}?tab=included`)

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

async function tierValuesFrom(form: FormData, t: Translate, activityId: string) {
  const priceMinor = fmoney(form, 'priceMinor', fcurrencyOr(form, 'currency'), t('common.price'))
  if (priceMinor < 0) throw new Error(t('activities.err_price_negative'))

  const maxGuests = fintOrNull(form, 'maxGuests', t('activities.max_guests'))
  if (maxGuests !== null && maxGuests < 1) throw new Error(t('activities.err_max_guests_min'))

  const pricingMode = fenum(
    form,
    'pricingMode',
    ['per_person', 'per_group', 'per_couple'] as const,
    'per_person',
  )
  const minGuests = fintOrNull(form, 'minGuests', t('ae.tier_min_guests'))
  if (minGuests !== null && (minGuests < 1 || (maxGuests !== null && minGuests > maxGuests))) {
    throw new Error(t('ae.err_min_guests'))
  }
  const groupMax = fintOrNull(form, 'groupMax', t('activities.group_max'))
  if (pricingMode === 'per_group' && (groupMax === null || groupMax < 1)) {
    throw new Error(t('activities.err_group_max'))
  }

  // Phase 2: children only cost less on a per-person package.
  const childPriceMinor =
    pricingMode === 'per_person'
      ? fmoneyOrNull(form, 'childPrice', fcurrencyOr(form, 'currency'), t('av.child_price'))
      : null

  return {
    name: flocalizedRequired(form, 'name', t('activities.tier_name')),
    tagline: flocalizedOrNull(form, 'tagline'),
    priceMinor,
    childPriceMinor,
    currency: fcurrency(form, 'currency'),
    pricingMode,
    groupMax: pricingMode === 'per_group' ? groupMax : null,
    maxGuests,
    minGuests,
    includes: flocalizedList(form, 'includes'),
    excludes: flocalizedList(form, 'excludes'),
    includesAddons: await ownIds(form, 'includesAddons', await includableAddonIds(activityId), t),
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
    // Phase 6: a new package is a new price.
    if (!can(session.role, 'prices.write')) throw new Error(t('team.err_prices'))
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

  refreshPublic()
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
      // Phase 6: without `prices.write` (a content editor) everything but the
      // price may change.
      if (
        !can(session.role, 'prices.write') &&
        (values.priceMinor !== before.priceMinor ||
          values.childPriceMinor !== before.childPriceMinor ||
          values.currency !== before.currency ||
          values.pricingMode !== before.pricingMode ||
          values.groupMax !== before.groupMax)
      ) {
        throw new Error(t('team.err_prices'))
      }

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

  refreshPublic()
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
    if (!can(session.role, 'prices.write')) throw new Error(t('team.err_prices'))
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

  refreshPublic()
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

/** What an add-on charges: guarded by `prices.write`. */
const ADDON_PRICE_KEYS = ['priceMinor', 'currency', 'pricing', 'maxQty'] as const

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
    assertPriceChangeAllowed(session.role, null, values, ['priceMinor'], t('team.err_prices'))
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

  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
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
      assertPriceChangeAllowed(session.role, before, values, ADDON_PRICE_KEYS, t('team.err_prices'))
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

  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
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

  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
}

// ---------------------------------------------------------------------------
// Package order
// ---------------------------------------------------------------------------

/** New order of an activity's packages after a drag. */
export async function reorderTiers(activityId: string, ids: string[]): Promise<boolean> {
  const session = await requireCapability('content.write')
  const wanted = [...new Set(ids.filter((value) => isUuid(value)))].slice(0, 50)
  try {
    await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: activityTiers.id })
        .from(activityTiers)
        .where(
          and(
            eq(activityTiers.activityId, activityId),
            inArray(activityTiers.id, wanted),
            isNull(activityTiers.deletedAt),
          ),
        )
      if (rows.length !== wanted.length) throw new Error('unknown package')
      for (const [index, id] of wanted.entries()) {
        await tx
          .update(activityTiers)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(eq(activityTiers.id, id))
      }
      await writeAudit(
        {
          actor: session,
          action: 'activity_tier.reorder',
          entityType: 'activity',
          entityId: activityId,
          before: null,
          after: { order: wanted },
        },
        tx,
      )
    })
    refreshPublic()
    return true
  } catch (error) {
    console.error('[reorderTiers]', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Activities included in a package
// ---------------------------------------------------------------------------

async function ownTier(activityId: string, tierId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: activityTiers.id })
    .from(activityTiers)
    .where(tierOf(activityId, tierId))
    .limit(1)
  return row !== undefined
}

export async function addTierIncluded(
  activityId: string,
  tierId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    if (!(await ownTier(activityId, tierId))) throw new Error(t('activities.err_tier_gone'))
    const includedId = fuuid(form, 'includedActivityId', t('ae.inc_activity'))
    if (includedId === activityId) throw new Error(t('ae.err_inc_self'))
    const [target] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(and(eq(activities.id, includedId), isNull(activities.deletedAt)))
      .limit(1)
    if (!target) throw new Error(t('ae.err_inc_unknown'))
    const timing = fenum(form, 'timing', ['same_slot', 'own_slot'] as const, 'same_slot')
    await db.transaction(async (tx) => {
      const [last] = await tx
        .select({ sortOrder: tierIncludedActivities.sortOrder })
        .from(tierIncludedActivities)
        .where(eq(tierIncludedActivities.tierId, tierId))
        .orderBy(sql`${tierIncludedActivities.sortOrder} desc`)
        .limit(1)
      const [row] = await tx
        .insert(tierIncludedActivities)
        .values({
          tierId,
          activityId: includedId,
          timing,
          sortOrder: (last?.sortOrder ?? -1) + 1,
        })
        .onConflictDoUpdate({
          target: [tierIncludedActivities.tierId, tierIncludedActivities.activityId],
          set: { timing, updatedAt: new Date() },
        })
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'tier_included.create',
          entityType: 'activity_tier',
          entityId: tierId,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_inc_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(includedEditor(activityId), outcome))
}

export async function saveTierIncluded(
  activityId: string,
  tierId: string,
  rowId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    if (!(await ownTier(activityId, tierId))) throw new Error(t('activities.err_tier_gone'))
    const timing = fenum(form, 'timing', ['same_slot', 'own_slot'] as const, 'same_slot')
    await db.transaction(async (tx) => {
      const [row] = await tx
        .update(tierIncludedActivities)
        .set({ timing, updatedAt: new Date() })
        .where(and(eq(tierIncludedActivities.id, rowId), eq(tierIncludedActivities.tierId, tierId)))
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'tier_included.update',
          entityType: 'activity_tier',
          entityId: tierId,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_inc_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(includedEditor(activityId), outcome))
}

export async function removeTierIncluded(
  activityId: string,
  tierId: string,
  rowId: string,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    if (!(await ownTier(activityId, tierId))) throw new Error(t('activities.err_tier_gone'))
    await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(tierIncludedActivities)
        .where(and(eq(tierIncludedActivities.id, rowId), eq(tierIncludedActivities.tierId, tierId)))
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'tier_included.delete',
          entityType: 'activity_tier',
          entityId: tierId,
          before: row ?? null,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_inc_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(includedEditor(activityId), outcome))
}

/** New order of the activities a package includes, after a drag. */
export async function reorderTierIncluded(
  activityId: string,
  tierId: string,
  ids: string[],
): Promise<boolean> {
  await requireCapability('content.write')
  if (!(await ownTier(activityId, tierId))) return false
  const wanted = [...new Set(ids.filter((value) => isUuid(value)))].slice(0, 50)
  try {
    await db.transaction(async (tx) => {
      for (const [index, id] of wanted.entries()) {
        await tx
          .update(tierIncludedActivities)
          .set({ sortOrder: index, updatedAt: new Date() })
          .where(and(eq(tierIncludedActivities.id, id), eq(tierIncludedActivities.tierId, tierId)))
      }
    })
    refreshPublic()
    return true
  } catch (error) {
    console.error('[reorderTierIncluded]', error)
    return false
  }
}

// ---------------------------------------------------------------------------
// Library add-ons offered with this activity
// ---------------------------------------------------------------------------

async function linkValuesFrom(form: FormData, t: Translate, activityId: string, currency: string) {
  const priceMinor = fmoneyOrNull(form, 'priceMinor', currency, t('ae.lib_price_override'))
  if (priceMinor !== null && priceMinor < 0) throw new Error(t('activities.err_price_negative'))
  const tierRows = await db
    .select({ id: activityTiers.id })
    .from(activityTiers)
    .where(and(eq(activityTiers.activityId, activityId), isNull(activityTiers.deletedAt)))
  return {
    priceMinor,
    onlyPackages: await ownIds(
      form,
      'onlyPackages',
      tierRows.map((row) => row.id),
      t,
    ),
    required: fbool(form, 'required'),
    sortOrder: fint(form, 'sortOrder', 0, t('ae.lib_order')),
  }
}

async function libraryAddon(addonId: string) {
  const [row] = await db
    .select({ id: addonsLibrary.id, currency: addonsLibrary.currency })
    .from(addonsLibrary)
    .where(and(eq(addonsLibrary.id, addonId), isNull(addonsLibrary.deletedAt)))
    .limit(1)
  return row ?? null
}

export async function linkLibraryAddon(activityId: string, form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const addonId = fuuid(form, 'addonId', t('ae.lib_choose'))
    const addon = await libraryAddon(addonId)
    if (!addon) throw new Error(t('ae.err_link_unknown'))
    const values = await linkValuesFrom(form, t, activityId, addon.currency)
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ priceMinor: activityAddonLinks.priceMinor })
        .from(activityAddonLinks)
        .where(
          and(
            eq(activityAddonLinks.activityId, activityId),
            eq(activityAddonLinks.addonId, addonId),
          ),
        )
        .limit(1)
      assertPriceChangeAllowed(
        session.role,
        existing ?? null,
        values,
        ['priceMinor'],
        t('team.err_prices'),
      )
      const [row] = await tx
        .insert(activityAddonLinks)
        .values({ activityId, addonId, ...values })
        .onConflictDoUpdate({
          target: [activityAddonLinks.activityId, activityAddonLinks.addonId],
          set: { ...values, updatedAt: new Date() },
        })
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity_addon_link.create',
          entityType: 'activity',
          entityId: activityId,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_link_added') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
}

export async function saveLibraryLink(
  activityId: string,
  addonId: string,
  form: FormData,
): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const addon = await libraryAddon(addonId)
    if (!addon) throw new Error(t('ae.err_link_unknown'))
    const values = await linkValuesFrom(form, t, activityId, addon.currency)
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ priceMinor: activityAddonLinks.priceMinor })
        .from(activityAddonLinks)
        .where(
          and(
            eq(activityAddonLinks.activityId, activityId),
            eq(activityAddonLinks.addonId, addonId),
          ),
        )
        .limit(1)
      assertPriceChangeAllowed(
        session.role,
        before ?? null,
        values,
        ['priceMinor'],
        t('team.err_prices'),
      )
      const [row] = await tx
        .update(activityAddonLinks)
        .set({ ...values, updatedAt: new Date() })
        .where(
          and(
            eq(activityAddonLinks.activityId, activityId),
            eq(activityAddonLinks.addonId, addonId),
          ),
        )
        .returning()
      await writeAudit(
        {
          actor: session,
          action: 'activity_addon_link.update',
          entityType: 'activity',
          entityId: activityId,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_link_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
}

export async function unlinkLibraryAddon(activityId: string, addonId: string): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(activityAddonLinks)
        .where(
          and(
            eq(activityAddonLinks.activityId, activityId),
            eq(activityAddonLinks.addonId, addonId),
          ),
        )
        .returning()
      // A package that listed it as included stops doing so.
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
          action: 'activity_addon_link.delete',
          entityType: 'activity',
          entityId: activityId,
          before: row ?? null,
          after: null,
        },
        tx,
      )
    })
    outcome = { ok: t('ae.ok_link_removed') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  refreshPublic()
  redirect(withOutcome(addonEditor(activityId), outcome))
}

/** Every add-on id a package of this activity may include (own + linked). */
async function includableAddonIds(activityId: string): Promise<string[]> {
  const [own, linked] = await Promise.all([
    db
      .select({ id: activityAddons.id })
      .from(activityAddons)
      .where(and(eq(activityAddons.activityId, activityId), isNull(activityAddons.deletedAt))),
    db
      .select({ id: activityAddonLinks.addonId })
      .from(activityAddonLinks)
      .where(eq(activityAddonLinks.activityId, activityId))
      .orderBy(asc(activityAddonLinks.sortOrder)),
  ])
  return [...own, ...linked].map((row) => row.id)
}
