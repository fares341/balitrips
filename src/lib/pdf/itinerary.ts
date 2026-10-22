/**
 * Itinerary documents.
 *
 * Generated **per itinerary version, per locale, at publish time** — never
 * per order and never on the request path. Three consequences follow from
 * that, and all three are the point:
 *
 *  1. Chromium runs in the worker, on a queue capped at one job. It peaks
 *     around 1.5 GiB, and the droplet's 4 GiB are shared with Postgres.
 *  2. A customer download is a database lookup plus a presigned URL. No
 *     rendering, no timeout, no cold start.
 *  3. Because `orders.order_items.ref_version` pins the version bought, the
 *     March buyer keeps downloading the March plan after the itinerary is
 *     restructured in June. That only works if every published version is
 *     rendered and kept, so this function never deletes an older version's
 *     documents.
 *
 * Re-running is safe and cheap: an existing (itinerary, version, locale) row
 * is skipped unless `force` is set, so the sweep can run on a schedule and
 * repair whatever is missing without re-rendering the world.
 */

import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  itineraryDocuments,
  mapPlaces,
} from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'
import { translator } from '@/lib/email/catalogue'
import { BALI_TIME_ZONE } from '@/lib/booking-rules'
import { pick, pickOptional, type LocalizedInput } from '@/lib/content/localize'
import { googleMapsPlaceUrl, googleMapsSearchUrl, orderStops } from '@/lib/itineraries/day-route'
import { uploadPrivate } from '@/lib/storage'

import { renderPdf } from './gotenberg'
import { itineraryPdfHtml, type ItineraryPdfDay } from './templates'

export const BRAND = 'Bali Trips'

/** Deterministic and version-scoped, so a republish never overwrites history. */
export function itineraryObjectKey(itineraryId: string, version: number, locale: Locale): string {
  return `itineraries/${itineraryId}/v${version}/${locale}.pdf`
}

export interface GeneratedDocument {
  itineraryId: string
  version: number
  locale: Locale
  objectKey: string
  bytes: number
  /** False when a document already existed and `force` was not set. */
  rendered: boolean
}

export interface GenerateItineraryOptions {
  /** Re-render locales that already have a document for this version. */
  force?: boolean
  /** Defaults to every configured locale. */
  onlyLocales?: readonly Locale[]
}

/**
 * The joined shape, typed against `LocalizedInput` rather than the schema's
 * `Localized`. Every one of these is a `jsonb` column reached through a LEFT
 * JOIN, so at runtime it can be null, partially translated, or absent — which
 * is exactly what `pick()` exists to resolve.
 */
interface DayRow {
  id: string
  dayNumber: number
  isFreeDay: boolean
  title: LocalizedInput
  description: LocalizedInput
  activityName: LocalizedInput
  activityArea: LocalizedInput
  activityDescription: LocalizedInput
}

export class ItineraryDocumentError extends Error {
  constructor(
    message: string,
    readonly itineraryId: string,
  ) {
    super(message)
    this.name = 'ItineraryDocumentError'
  }
}

/**
 * Render and store every missing locale for an itinerary's CURRENT version.
 */
export async function generateItineraryDocuments(
  itineraryId: string,
  options: GenerateItineraryOptions = {},
): Promise<GeneratedDocument[]> {
  const [itinerary] = await db
    .select({
      id: itineraries.id,
      slug: itineraries.slug,
      name: itineraries.name,
      blurb: itineraries.blurb,
      version: itineraries.version,
      days: itineraries.days,
      status: itineraries.status,
      deletedAt: itineraries.deletedAt,
    })
    .from(itineraries)
    .where(eq(itineraries.id, itineraryId))
    .limit(1)

  if (!itinerary) {
    throw new ItineraryDocumentError('Itinerary does not exist', itineraryId)
  }
  if (itinerary.deletedAt !== null) {
    throw new ItineraryDocumentError('Itinerary is archived', itineraryId)
  }

  const dayRows: DayRow[] = await db
    .select({
      id: itineraryDays.id,
      dayNumber: itineraryDays.dayNumber,
      isFreeDay: itineraryDays.isFreeDay,
      title: itineraryDays.title,
      description: itineraryDays.description,
      activityName: activities.name,
      activityArea: activities.area,
      activityDescription: activities.description,
    })
    .from(itineraryDays)
    .leftJoin(activities, eq(itineraryDays.activityId, activities.id))
    .where(eq(itineraryDays.itineraryId, itineraryId))
    .orderBy(asc(itineraryDays.dayNumber))

  if (dayRows.length === 0) {
    // Publishing already refuses this, but the sweep can reach an itinerary
    // whose plan was emptied afterwards. A one-page PDF with no plan is a
    // support ticket; failing loudly is not.
    throw new ItineraryDocumentError('Itinerary has no authored days', itineraryId)
  }

  /**
   * The places of each day, in visiting order, each with its Google Maps
   * link. The PDF is the paid product, so every place is printed — the
   * map's per-place gate applies to the website, not to the buyer's file.
   */
  const placeRows = await db
    .select({
      dayId: itineraryDayPlaces.dayId,
      sortOrder: itineraryDayPlaces.sortOrder,
      note: itineraryDayPlaces.note,
      visitTime: itineraryDayPlaces.visitTime,
      name: mapPlaces.name,
      slug: mapPlaces.slug,
      lat: mapPlaces.lat,
      lon: mapPlaces.lon,
    })
    .from(itineraryDayPlaces)
    .innerJoin(mapPlaces, eq(mapPlaces.id, itineraryDayPlaces.placeId))
    .where(
      inArray(
        itineraryDayPlaces.dayId,
        dayRows.map((row) => row.id),
      ),
    )

  const existing = await db
    .select({ locale: itineraryDocuments.locale })
    .from(itineraryDocuments)
    .where(
      and(
        eq(itineraryDocuments.itineraryId, itineraryId),
        eq(itineraryDocuments.version, itinerary.version),
      ),
    )
  const have = new Set(existing.map((row) => row.locale))

  const wanted = options.onlyLocales ?? locales
  const results: GeneratedDocument[] = []

  for (const locale of wanted) {
    const objectKey = itineraryObjectKey(itineraryId, itinerary.version, locale)

    if (options.force !== true && have.has(locale)) {
      results.push({
        itineraryId,
        version: itinerary.version,
        locale,
        objectKey,
        bytes: 0,
        rendered: false,
      })
      continue
    }

    const t = translator(locale)
    const number = new Intl.NumberFormat(locale)
    const generated = new Intl.DateTimeFormat(locale, {
      dateStyle: 'long',
      timeZone: BALI_TIME_ZONE,
    }).format(new Date())

    const days: ItineraryPdfDay[] = dayRows.map((row) => ({
      dayNumber: row.dayNumber,
      // The authored title wins; the linked activity's name is the fallback.
      // A free day with neither falls through to the localized free-day copy
      // in the template — never to untranslated filler, which is precisely
      // what the prototype rendered.
      title: pickOptional(row.title, locale) ?? pickOptional(row.activityName, locale),
      description:
        pickOptional(row.description, locale) ?? pickOptional(row.activityDescription, locale),
      area: pickOptional(row.activityArea, locale),
      isFreeDay: row.isFreeDay,
      mapsUrl:
        pickOptional(row.activityName, locale) === null
          ? null
          : googleMapsSearchUrl(
              pickOptional(row.activityName, locale),
              pickOptional(row.activityArea, locale),
            ),
      places: orderStops(placeRows.filter((place) => place.dayId === row.id)).map((place) => ({
        name: pick(place.name as LocalizedInput, locale, place.slug),
        time: place.visitTime,
        note: pickOptional(place.note as LocalizedInput, locale),
        mapsUrl: googleMapsPlaceUrl(place.lat, place.lon),
      })),
    }))

    const name = pick(itinerary.name, locale, itinerary.slug)

    const html = itineraryPdfHtml({
      locale,
      name,
      blurb: pickOptional(itinerary.blurb, locale),
      version: itinerary.version,
      days,
      labels: {
        brand: BRAND,
        dayByDay: t('dt_daybyday'),
        dayNumber: (n) => t('pdf_day_n', { n: number.format(n) }),
        freeDay: t('pdf_free_day'),
        maps: t('it_gmaps'),
        version: t('pdf_version', { version: number.format(itinerary.version) }),
        generated: t('pdf_generated', { date: generated }),
        confidential: t('pdf_confidential'),
        daysCount: `${number.format(dayRows.length)} ${t('c_days')}`,
      },
    })

    const pdf = await renderPdf({
      html,
      metadata: {
        Title: `${name} — v${itinerary.version}`,
        Author: BRAND,
        Creator: BRAND,
        Subject: t('dt_daybyday'),
      },
    })

    const upload = await uploadPrivate({
      key: objectKey,
      body: pdf,
      contentType: 'application/pdf',
    })

    await db
      .insert(itineraryDocuments)
      .values({
        itineraryId,
        version: itinerary.version,
        locale,
        objectKey,
        bytes: upload.bytes,
      })
      .onConflictDoUpdate({
        target: [
          itineraryDocuments.itineraryId,
          itineraryDocuments.version,
          itineraryDocuments.locale,
        ],
        set: { objectKey, bytes: upload.bytes },
      })

    results.push({
      itineraryId,
      version: itinerary.version,
      locale,
      objectKey,
      bytes: upload.bytes,
      rendered: true,
    })
  }

  return results
}

/**
 * Published itineraries whose current version is missing at least one locale.
 *
 * This is what makes the whole thing self-healing. The admin publish action
 * enqueues a render, but a job can be lost, Gotenberg can be down for an
 * afternoon, and an itinerary can be published by a script that predates the
 * queue. The scheduled sweep asks the database what is actually missing
 * rather than trusting that every publish was followed by a successful
 * render.
 */
export async function itinerariesMissingDocuments(limit = 25): Promise<string[]> {
  const published = await db
    .select({ id: itineraries.id, version: itineraries.version })
    .from(itineraries)
    .where(and(eq(itineraries.status, 'published'), isNull(itineraries.deletedAt)))

  if (published.length === 0) return []

  const documents = await db
    .select({
      itineraryId: itineraryDocuments.itineraryId,
      version: itineraryDocuments.version,
      locale: itineraryDocuments.locale,
    })
    .from(itineraryDocuments)
    .where(
      inArray(
        itineraryDocuments.itineraryId,
        published.map((row) => row.id),
      ),
    )

  const seen = new Map<string, Set<string>>()
  for (const doc of documents) {
    const key = `${doc.itineraryId}@${doc.version}`
    const set = seen.get(key) ?? new Set<string>()
    set.add(doc.locale)
    seen.set(key, set)
  }

  const missing: string[] = []
  for (const row of published) {
    const have = seen.get(`${row.id}@${row.version}`) ?? new Set<string>()
    if (locales.some((locale) => !have.has(locale))) missing.push(row.id)
    if (missing.length >= limit) break
  }

  return missing
}
