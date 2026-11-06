/**
 * Database side of the public itinerary pages (phase 2). Selects only the
 * columns the public DTOs allow (`./public-dto`): the day query reads the day
 * number and teaser fields, never the title, description, activity or places,
 * and the itinerary query never reads `linked_place_ids`, the PDF keys or the
 * internal notes.
 */

import { readFx } from '@/lib/currency/fx-store'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import { itineraries, itineraryDays, media, plans } from '@/db/schema'
import { toMedia } from '@/lib/content/queries'
import { entityHref } from '@/lib/content/types'
import type { LocalizedText } from '@/lib/content/localize'

import { mapBundleOffer, type MapBundleOffer } from './map-bundle'
import {
  audienceKeysOf,
  cleanLocalized,
  teaserSplit,
  toPublicImage,
  toPublicFaq,
  toPublicStats,
  type MediaLike,
  type PublicItineraryDetail,
  type PublicItinerarySummary,
} from './public-dto'
import { readItinerarySales } from './sales-settings-store'
import type { ItinerarySalesSettings } from './sales-settings'
import { normaliseTierPrices } from './tiers'

const LIVE = and(eq(itineraries.status, 'published'), isNull(itineraries.deletedAt))

const SUMMARY_COLUMNS = {
  id: itineraries.id,
  slug: itineraries.slug,
  name: itineraries.name,
  blurb: itineraries.blurb,
  days: itineraries.days,
  audience: itineraries.audience,
  tripType: itineraries.tripType,
  priceMinor: itineraries.priceMinor,
  currency: itineraries.currency,
  tierPrices: itineraries.tierPrices,
  includesMap: itineraries.includesMap,
  isPopular: itineraries.isPopular,
  heroImageId: itineraries.heroImageId,
  previewStats: itineraries.previewStats,
}

type SummaryRow = Pick<typeof itineraries.$inferSelect, keyof typeof SUMMARY_COLUMNS>

async function mediaById(
  ids: readonly (string | null | undefined)[],
): Promise<Map<string, MediaLike>> {
  const wanted = [...new Set(ids.filter((id): id is string => typeof id === 'string'))]
  const out = new Map<string, MediaLike>()
  if (wanted.length === 0) return out
  const rows = await db.select().from(media).where(inArray(media.id, wanted))
  for (const row of rows) {
    const dto = toMedia(row)
    if (dto === null) continue
    out.set(row.id, {
      id: dto.id,
      url: dto.url,
      width: dto.width,
      height: dto.height,
      srcSetAvif: dto.srcSetAvif,
      srcSetWebp: dto.srcSetWebp,
    })
  }
  return out
}

const localizedList = (raw: unknown): LocalizedText[] =>
  Array.isArray(raw)
    ? raw.filter((entry): entry is LocalizedText => entry !== null && typeof entry === 'object')
    : []

function toSummary(row: SummaryRow, images: Map<string, MediaLike>): PublicItinerarySummary {
  const audience = localizedList(row.audience)
  const name = (row.name ?? {}) as LocalizedText
  return {
    id: row.id,
    slug: row.slug,
    href: entityHref('itinerary', row.slug),
    name,
    blurb: (row.blurb as LocalizedText | null) ?? null,
    days: row.days,
    audience,
    audienceKeys: audienceKeysOf(audience, name),
    tripType: (row.tripType as LocalizedText | null) ?? null,
    priceMinor: row.priceMinor,
    currency: row.currency,
    tierPrices: normaliseTierPrices(row.tierPrices),
    includesMap: row.includesMap === true,
    isPopular: row.isPopular === true,
    hero: toPublicImage(images.get(row.heroImageId ?? '')),
    stats: toPublicStats(row.previewStats),
  }
}

export async function listPublicItineraries(): Promise<PublicItinerarySummary[]> {
  const rows = await db
    .select(SUMMARY_COLUMNS)
    .from(itineraries)
    .where(LIVE)
    .orderBy(asc(itineraries.days), asc(itineraries.priceMinor))
  const images = await mediaById(rows.map((row) => row.heroImageId))
  return rows.map((row) => toSummary(row, images))
}

export async function getPublicItinerary(slug: string): Promise<PublicItineraryDetail | null> {
  const [row] = await db
    .select({
      ...SUMMARY_COLUMNS,
      detailedDescription: itineraries.detailedDescription,
      galleryImageIds: itineraries.galleryImageIds,
      galleryCaptions: itineraries.galleryCaptions,
      teaserDaysVisible: itineraries.teaserDaysVisible,
      seoTitle: itineraries.seoTitle,
      seoDescription: itineraries.seoDescription,
      faq: itineraries.faq,
    })
    .from(itineraries)
    .where(and(LIVE, eq(itineraries.slug, slug)))
    .limit(1)
  if (!row) return null

  // Day number and teaser fields ONLY.
  const dayRows = await db
    .select({
      dayNumber: itineraryDays.dayNumber,
      teaserImageId: itineraryDays.teaserImageId,
      teaserMood: itineraryDays.teaserMood,
    })
    .from(itineraryDays)
    .where(eq(itineraryDays.itineraryId, row.id))
    .orderBy(asc(itineraryDays.dayNumber))
  // A travel-day row (0, or past the length) is not one of the sold days.
  const sold = dayRows.filter((day) => day.dayNumber >= 1 && day.dayNumber <= row.days)
  const { shown, more } = teaserSplit(sold, row.teaserDaysVisible)

  const galleryIds = (row.galleryImageIds ?? []).filter((id) => typeof id === 'string')
  const images = await mediaById([
    row.heroImageId,
    ...galleryIds,
    ...shown.map((day) => day.teaserImageId),
  ])
  const captions = (row.galleryCaptions ?? {}) as Record<string, unknown>

  return {
    ...toSummary(row, images),
    intro: (row.detailedDescription as LocalizedText | null) ?? null,
    gallery: galleryIds.flatMap((id) => {
      const image = toPublicImage(images.get(id), cleanLocalized(captions[id]))
      return image === null ? [] : [image]
    }),
    teaserDays: shown.map((day) => ({
      dayNumber: day.dayNumber,
      image: toPublicImage(images.get(day.teaserImageId ?? '')),
      mood: cleanLocalized(day.teaserMood),
    })),
    moreDays: Math.max(0, more + Math.max(0, row.days - sold.length)),
    seoTitle: cleanLocalized(row.seoTitle),
    seoDescription: cleanLocalized(row.seoDescription),
    faq: toPublicFaq(row.faq),
  }
}

/** The «الجدول + الخريطة» offer from the settings and the live map products. */
export async function loadMapBundleOffer(
  settings?: ItinerarySalesSettings,
): Promise<MapBundleOffer | null> {
  const [sales, rows] = await Promise.all([
    settings ?? readItinerarySales(),
    db
      .select({
        id: plans.id,
        priceMinor: plans.priceMinor,
        currency: plans.currency,
        kind: plans.entitlementKind,
        status: plans.status,
      })
      .from(plans)
      .where(and(inArray(plans.entitlementKind, ['map_access', 'vip']), isNull(plans.deletedAt))),
  ])
  return mapBundleOffer(
    sales,
    rows.map((row) => ({ ...row, published: row.status === 'published' })),
    (await readFx()).rates,
  )
}
