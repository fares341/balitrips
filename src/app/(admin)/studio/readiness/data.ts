/**
 * «جاهزية المحتوى» — what is still missing before launch (owner, Oct 2026).
 * Read-only queries over the catalogue; the page and its CSV share them.
 */

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityImages,
  activityTiers,
  articles,
  categories,
  itineraries,
  mapPlaces,
  packages,
  regions,
} from '@/db/schema'
import type { Localized } from '@/db/schema/_shared'
import { readSetting } from '@/app/(admin)/_lib/settings'
import type { Locale } from '@/i18n/config'
import { pick } from '@/lib/content/localize'

/** Free-guide categories the home page shows (they must not be empty). */
export const GUIDE_CATEGORY_KEYS = ['hospital', 'mosques', 'malls', 'markets'] as const

export type ActivityGap = 'packages' | 'price' | 'meeting' | 'duration' | 'photo'

export interface PlaceRow {
  id: string
  name: string
  area: string
  hasVideo: boolean
}
export interface ActivityRow {
  id: string
  name: string
  area: string
  gaps: ActivityGap[]
}
export interface ItineraryRow {
  id: string
  name: string
}

export interface Readiness {
  placesTotal: number
  placesNoPhoto: PlaceRow[]
  activitiesTotal: number
  activityGaps: ActivityRow[]
  itinerariesTotal: number
  itinerariesNoTiers: ItineraryRow[]
  packagesPublished: number
  articlesPublished: number
  visaSet: boolean
  emptyGuideCategories: { key: string; label: string }[]
}

function filled(value: Localized | null | undefined): boolean {
  return !!value && Object.values(value).some((text) => (text ?? '').trim() !== '')
}

export async function loadReadiness(locale: Locale): Promise<Readiness> {
  const unknownArea = locale === 'ar' ? 'بدون منطقة' : 'No area'
  const [regionRows, placeRows, activityRows, tierRows, imageRows, itineraryRows] =
    await Promise.all([
      db.select({ id: regions.id, label: regions.label, key: regions.key }).from(regions),
      db
        .select({
          id: mapPlaces.id,
          name: mapPlaces.name,
          slug: mapPlaces.slug,
          regionId: mapPlaces.regionId,
          categoryId: mapPlaces.categoryId,
          heroImageId: mapPlaces.heroImageId,
          gallery: mapPlaces.galleryImageIds,
          videos: mapPlaces.videos,
        })
        .from(mapPlaces)
        .where(
          and(
            eq(mapPlaces.status, 'published'),
            eq(mapPlaces.isHidden, false),
            isNull(mapPlaces.deletedAt),
          ),
        ),
      db
        .select({
          id: activities.id,
          name: activities.name,
          slug: activities.slug,
          regionId: activities.regionId,
          priceMinor: activities.priceMinor,
          meetingPoint: activities.meetingPoint,
          meetingMapUrl: activities.meetingMapUrl,
          duration: activities.duration,
          heroImageId: activities.heroImageId,
        })
        .from(activities)
        .where(
          and(
            inArray(activities.status, ['published', 'unavailable']),
            isNull(activities.mergedIntoId),
            isNull(activities.deletedAt),
          ),
        ),
      db
        .select({ activityId: activityTiers.activityId, n: sql<number>`count(*)::int` })
        .from(activityTiers)
        .where(isNull(activityTiers.deletedAt))
        .groupBy(activityTiers.activityId),
      db
        .select({ activityId: activityImages.activityId, n: sql<number>`count(*)::int` })
        .from(activityImages)
        .groupBy(activityImages.activityId),
      db
        .select({
          id: itineraries.id,
          name: itineraries.name,
          slug: itineraries.slug,
          tierPrices: itineraries.tierPrices,
        })
        .from(itineraries)
        .where(and(eq(itineraries.status, 'published'), isNull(itineraries.deletedAt))),
    ])

  const areaOf = new Map(regionRows.map((r) => [r.id, pick(r.label, locale, r.key)]))
  const area = (id: string | null) => (id ? (areaOf.get(id) ?? unknownArea) : unknownArea)
  const tiers = new Map(tierRows.map((r) => [r.activityId, r.n]))
  const images = new Map(imageRows.map((r) => [r.activityId, r.n]))

  const placesNoPhoto = placeRows
    .filter((p) => p.heroImageId === null && (p.gallery ?? []).length === 0)
    .map((p) => ({
      id: p.id,
      name: pick(p.name, locale, p.slug),
      area: area(p.regionId),
      hasVideo: (p.videos ?? []).length > 0,
    }))
    .sort((a, b) => a.area.localeCompare(b.area) || a.name.localeCompare(b.name))

  const activityGaps = activityRows
    .map((a) => {
      const gaps: ActivityGap[] = []
      if ((tiers.get(a.id) ?? 0) === 0) gaps.push('packages')
      if (a.priceMinor <= 0) gaps.push('price')
      if (!filled(a.meetingPoint) && !a.meetingMapUrl) gaps.push('meeting')
      if (!filled(a.duration)) gaps.push('duration')
      if (a.heroImageId === null && (images.get(a.id) ?? 0) === 0) gaps.push('photo')
      return { id: a.id, name: pick(a.name, locale, a.slug), area: area(a.regionId), gaps }
    })
    .filter((a) => a.gaps.length > 0)
    .sort((a, b) => b.gaps.length - a.gaps.length || a.name.localeCompare(b.name))

  const itinerariesNoTiers = itineraryRows
    .filter((i) => Object.values(i.tierPrices ?? {}).every((v) => !v || v <= 0))
    .map((i) => ({ id: i.id, name: pick(i.name, locale, i.slug) }))

  const [[pkg], [art], guideCats, home] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(packages)
      .where(and(eq(packages.status, 'published'), isNull(packages.deletedAt))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(articles)
      .where(and(eq(articles.status, 'published'), isNull(articles.deletedAt))),
    db
      .select({ id: categories.id, key: categories.key, label: categories.label })
      .from(categories)
      .where(inArray(categories.key, [...GUIDE_CATEGORY_KEYS])),
    readSetting('home'),
  ])

  const placesPerCategory = new Map<string, number>()
  for (const p of placeRows) {
    if (p.categoryId)
      placesPerCategory.set(p.categoryId, (placesPerCategory.get(p.categoryId) ?? 0) + 1)
  }
  const emptyGuideCategories = GUIDE_CATEGORY_KEYS.map((key) => {
    const cat = guideCats.find((c) => c.key === key)
    return {
      key,
      label: cat ? pick(cat.label, locale, key) : key,
      count: cat ? (placesPerCategory.get(cat.id) ?? 0) : 0,
    }
  })
    .filter((c) => c.count === 0)
    .map(({ key, label }) => ({ key, label }))

  return {
    placesTotal: placeRows.length,
    placesNoPhoto,
    activitiesTotal: activityRows.length,
    activityGaps,
    itinerariesTotal: itineraryRows.length,
    itinerariesNoTiers,
    packagesPublished: pkg?.n ?? 0,
    articlesPublished: art?.n ?? 0,
    visaSet: home.visaAmount.trim() !== '',
    emptyGuideCategories,
  }
}
