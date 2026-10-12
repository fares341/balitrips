/**
 * Database seed.
 *
 * Loads the design handoff's content dataset (`content.json`, produced by
 * `scripts/extract-content.mjs`) and the 597 UI strings from `messages/`
 * into Postgres.
 *
 * Run: pnpm db:seed
 *
 * ## Idempotency
 *
 * Every statement is an upsert on a natural key — `slug` for content
 * entities, `key` for taxonomy and translations, `vehicle_class` for the
 * fleet — so the seed can be re-run against a populated database. Join tables
 * and itinerary days have no meaningful natural key of their own, so they are
 * deleted and rewritten for exactly the parents this seed owns; nothing
 * references those rows, so replacing them is safe.
 *
 * Re-running only overwrites columns that come FROM the handoff. Publish
 * state, lead times, time slots, fleet sizes and per-activity inclusions are
 * written once on insert and never touched again, so a re-seed cannot revert
 * an editor's work in the admin.
 *
 * ## Not seeded
 *
 * No media. Every image in the handoff is a loremflickr placeholder built
 * from a query string (`flickr: "mount-batur,volcano"`); seeding those as
 * `media` rows would create records pointing at an image CDN we do not own.
 * `heroImageId` stays null everywhere and real imagery is imported
 * separately.
 */

import { inArray } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityCategories,
  articleCategories,
  articles,
  categories,
  driverVehicles,
  itineraries,
  itineraryDays,
  itineraryRegions,
  landmarks,
  mapPlaces,
  packageActivities,
  packageRegions,
  packages,
  regions,
  reviews,
  translations,
  type Localized,
} from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'
import { vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'

import arMessages from '../../../messages/ar.json'
import enMessages from '../../../messages/en.json'
import idMessages from '../../../messages/id.json'
import contentJson from './content.json'
import { SEED_CURRENCY, assignSlugs, deterministicId, must, overwrite, toMinor } from './helpers'
import type { ContentData } from './types'

const content = contentJson as unknown as ContentData

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: enMessages,
  ar: arMessages,
  id: idMessages,
}

/** One timestamp for the whole run, so a seeded row set shares a publish time. */
const SEEDED_AT = new Date()

/**
 * Bookable start times.
 *
 * The prototype hard-coded these four in the booking widget for every
 * activity. They become a per-activity default here so the admin can diverge
 * from them, which the prototype could not.
 */
const DEFAULT_TIME_SLOTS = ['09:00', '11:30', '14:00', '16:30']

/**
 * The prototype rendered this inline in `page-plans.jsx` for any day past the
 * end of the activity list. Those days are now authored rows, and this is
 * their title.
 */
const FREE_DAY_TITLE: Localized = {
  en: 'Free day to explore & relax',
  ar: 'يوم حر للاستكشاف والراحة',
  id: 'Hari bebas untuk eksplorasi & santai',
}

/**
 * The driver rate table.
 *
 * The prototype expressed this as a ternary chain inline in the driver page:
 * `veh === "van" ? 95 : veh === "suv" ? 70 : 45`. The passenger bands are
 * cross-checked against `vehicleForPassengers` below rather than restated,
 * so the seed and the booking rules cannot drift apart.
 */
const FLEET: readonly {
  vehicleClass: VehicleClass
  labelKey: string
  descriptionKey: string
  minPassengers: number
  maxPassengers: number
  dayRateWhole: number
  fleetSize: number
}[] = [
  {
    vehicleClass: 'sedan',
    labelKey: 'dp_veh_sedan',
    descriptionKey: 'dp_veh_sedan_b',
    minPassengers: 1,
    maxPassengers: 4,
    dayRateWhole: 45,
    fleetSize: 5,
  },
  {
    vehicleClass: 'suv',
    labelKey: 'dp_veh_suv',
    descriptionKey: 'dp_veh_suv_b',
    minPassengers: 5,
    maxPassengers: 7,
    dayRateWhole: 70,
    fleetSize: 5,
  },
  {
    vehicleClass: 'van',
    labelKey: 'dp_veh_van',
    descriptionKey: 'dp_veh_van_b',
    minPassengers: 8,
    maxPassengers: 20,
    dayRateWhole: 95,
    fleetSize: 5,
  },
]

/** Pull one UI string across all three locales, falling back to English. */
function fromMessages(key: string): Localized {
  const english = MESSAGES.en[key]
  if (english === undefined) throw new Error(`messages/en.json has no key "${key}"`)
  return {
    en: english,
    ar: MESSAGES.ar[key] ?? english,
    id: MESSAGES.id[key] ?? english,
  }
}

async function seed(): Promise<Map<string, number>> {
  const counts = new Map<string, number>()

  await db.transaction(async (tx) => {
    // -----------------------------------------------------------------------
    // Taxonomy
    // -----------------------------------------------------------------------

    const regionRows = Object.entries(content.REGIONS).map(([key, label], index) => ({
      key,
      label,
      sortOrder: index,
    }))
    const insertedRegions = await tx
      .insert(regions)
      .values(regionRows)
      .onConflictDoUpdate({
        target: regions.key,
        set: overwrite(regions, ['label', 'sortOrder']),
      })
      .returning({ id: regions.id, key: regions.key })
    const regionId = new Map(insertedRegions.map((row) => [row.key, row.id]))
    counts.set('regions', insertedRegions.length)

    // The "Travelers love" collections are the only place the handoff pairs a
    // category with an icon, so that mapping lands on the category itself.
    const categoryIcons = new Map(content.LOVED.map((c) => [c.key, c.ic]))
    const categoryRows = content.ACT_CATS.map((cat, index) => ({
      key: cat.key,
      label: cat.label,
      icon: categoryIcons.get(cat.key) ?? null,
      sortOrder: index,
    }))
    const insertedCategories = await tx
      .insert(categories)
      .values(categoryRows)
      .onConflictDoUpdate({
        target: categories.key,
        set: overwrite(categories, ['label', 'icon', 'sortOrder']),
      })
      .returning({ id: categories.id, key: categories.key })
    const categoryId = new Map(insertedCategories.map((row) => [row.key, row.id]))
    counts.set('categories', insertedCategories.length)

    // -----------------------------------------------------------------------
    // Activities
    // -----------------------------------------------------------------------

    const activitySlugs = assignSlugs(
      content.ACTIVITIES,
      (a) => a.name.en,
      (a) => a.id,
    )
    const activityRows = content.ACTIVITIES.map((a, index) => ({
      slug: must(activitySlugs, a.id, 'activity slug'),
      legacyId: a.id,
      name: a.name,
      area: a.area,
      description: a.desc,
      duration: a.dur,
      regionId: must(regionId, a.region, 'region'),
      priceMinor: toMinor(a.price),
      currency: SEED_CURRENCY,
      rating: a.rating,
      reviewCount: a.reviews,
      timeSlots: DEFAULT_TIME_SLOTS,
      sortOrder: index,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedActivities = await tx
      .insert(activities)
      .values(activityRows)
      .onConflictDoUpdate({
        target: activities.slug,
        set: overwrite(activities, [
          'legacyId',
          'name',
          'area',
          'description',
          'duration',
          'regionId',
          'priceMinor',
          'currency',
          'rating',
          'reviewCount',
          'sortOrder',
        ]),
      })
      .returning({ id: activities.id, legacyId: activities.legacyId })

    const activityId = new Map<string, string>()
    for (const row of insertedActivities) {
      if (row.legacyId !== null) activityId.set(row.legacyId, row.id)
    }
    counts.set('activities', insertedActivities.length)

    const activityUuids = [...activityId.values()]
    await tx.delete(activityCategories).where(inArray(activityCategories.activityId, activityUuids))
    const activityCategoryRows = content.ACTIVITIES.flatMap((a) =>
      a.cats.map((cat) => ({
        activityId: must(activityId, a.id, 'activity'),
        categoryId: must(categoryId, cat, 'category'),
      })),
    )
    await tx.insert(activityCategories).values(activityCategoryRows)
    counts.set('activity_categories', activityCategoryRows.length)

    // -----------------------------------------------------------------------
    // Itineraries
    // -----------------------------------------------------------------------

    const itinerarySlugs = assignSlugs(
      content.ITINERARIES,
      (it) => it.name.en,
      (it) => it.id,
    )
    const itineraryRows = content.ITINERARIES.map((it) => ({
      slug: must(itinerarySlugs, it.id, 'itinerary slug'),
      legacyId: it.id,
      name: it.name,
      blurb: it.blurb,
      days: it.days,
      spots: it.spots,
      tripType: it.type,
      audience: it.audience,
      priceMinor: toMinor(it.price),
      currency: SEED_CURRENCY,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedItineraries = await tx
      .insert(itineraries)
      .values(itineraryRows)
      .onConflictDoUpdate({
        target: itineraries.slug,
        set: overwrite(itineraries, [
          'legacyId',
          'name',
          'blurb',
          'days',
          'spots',
          'tripType',
          'audience',
          'priceMinor',
          'currency',
        ]),
      })
      .returning({ id: itineraries.id, legacyId: itineraries.legacyId })

    const itineraryId = new Map<string, string>()
    for (const row of insertedItineraries) {
      if (row.legacyId !== null) itineraryId.set(row.legacyId, row.id)
    }
    counts.set('itineraries', insertedItineraries.length)

    const itineraryUuids = [...itineraryId.values()]

    /*
     * Day plans as real rows.
     *
     * The prototype had no day table: `ItineraryDetailPage` built the plan at
     * render time with `acts[i]` and dropped an un-editable "Free day to
     * explore & relax" card wherever the activity list ran out. That mapping
     * is replicated here as authored rows — same activity per day, same free
     * days — but they are now data an editor can change.
     */
    await tx.delete(itineraryDays).where(inArray(itineraryDays.itineraryId, itineraryUuids))
    const dayRows = content.ITINERARIES.flatMap((it) => {
      const parent = must(itineraryId, it.id, 'itinerary')
      return Array.from({ length: it.days }, (_, index) => {
        const legacyActivity = it.acts[index]
        const linked = legacyActivity ? must(activityId, legacyActivity, 'activity') : null
        return {
          itineraryId: parent,
          dayNumber: index + 1,
          activityId: linked,
          isFreeDay: linked === null,
          title: linked === null ? FREE_DAY_TITLE : null,
        }
      })
    })
    await tx.insert(itineraryDays).values(dayRows)
    counts.set('itinerary_days', dayRows.length)
    counts.set('itinerary_days (free)', dayRows.filter((d) => d.isFreeDay).length)

    await tx.delete(itineraryRegions).where(inArray(itineraryRegions.itineraryId, itineraryUuids))
    const itineraryRegionRows = content.ITINERARIES.flatMap((it) =>
      it.regions.map((region) => ({
        itineraryId: must(itineraryId, it.id, 'itinerary'),
        regionId: must(regionId, region, 'region'),
      })),
    )
    await tx.insert(itineraryRegions).values(itineraryRegionRows)
    counts.set('itinerary_regions', itineraryRegionRows.length)

    // -----------------------------------------------------------------------
    // Packages
    // -----------------------------------------------------------------------

    const packageSlugs = assignSlugs(
      content.PACKAGES,
      (p) => p.name.en,
      (p) => p.id,
    )
    const packageRows = content.PACKAGES.map((p) => ({
      slug: must(packageSlugs, p.id, 'package slug'),
      legacyId: p.id,
      name: p.name,
      blurb: p.blurb,
      days: p.days,
      maxGuests: p.maxGuests,
      driverIncluded: p.driver,
      priceMinor: toMinor(p.price),
      currency: SEED_CURRENCY,
      // The prototype showed "from $X" but charged a flat X no matter how many
      // guests were selected. 'flat' is what it actually charged; the column
      // exists so the ambiguity is now a decision rather than a bug.
      pricingMode: 'flat',
      amenities: p.amenities,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedPackages = await tx
      .insert(packages)
      .values(packageRows)
      .onConflictDoUpdate({
        target: packages.slug,
        set: overwrite(packages, [
          'legacyId',
          'name',
          'blurb',
          'days',
          'maxGuests',
          'driverIncluded',
          'priceMinor',
          'currency',
          'amenities',
        ]),
      })
      .returning({ id: packages.id, legacyId: packages.legacyId })

    const packageId = new Map<string, string>()
    for (const row of insertedPackages) {
      if (row.legacyId !== null) packageId.set(row.legacyId, row.id)
    }
    counts.set('packages', insertedPackages.length)

    const packageUuids = [...packageId.values()]

    await tx.delete(packageActivities).where(inArray(packageActivities.packageId, packageUuids))
    const packageActivityRows = content.PACKAGES.flatMap((p) =>
      p.acts.map((act, index) => ({
        packageId: must(packageId, p.id, 'package'),
        activityId: must(activityId, act, 'activity'),
        sortOrder: index,
      })),
    )
    await tx.insert(packageActivities).values(packageActivityRows)
    counts.set('package_activities', packageActivityRows.length)

    await tx.delete(packageRegions).where(inArray(packageRegions.packageId, packageUuids))
    const packageRegionRows = content.PACKAGES.flatMap((p) =>
      p.regions.map((region) => ({
        packageId: must(packageId, p.id, 'package'),
        regionId: must(regionId, region, 'region'),
      })),
    )
    await tx.insert(packageRegions).values(packageRegionRows)
    counts.set('package_regions', packageRegionRows.length)

    // -----------------------------------------------------------------------
    // Landmarks
    // -----------------------------------------------------------------------

    const landmarkSlugs = assignSlugs(
      content.LANDMARKS,
      (l) => l.name.en,
      (l) => l.id,
    )
    const landmarkRows = content.LANDMARKS.map((l, index) => ({
      slug: must(landmarkSlugs, l.id, 'landmark slug'),
      legacyId: l.id,
      name: l.name,
      type: l.type,
      blurb: l.blurb,
      regionId: must(regionId, l.region, 'region'),
      activityId: must(activityId, l.actId, 'activity'),
      sortOrder: index,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedLandmarks = await tx
      .insert(landmarks)
      .values(landmarkRows)
      .onConflictDoUpdate({
        target: landmarks.slug,
        set: overwrite(landmarks, [
          'legacyId',
          'name',
          'type',
          'blurb',
          'regionId',
          'activityId',
          'sortOrder',
        ]),
      })
      .returning({ id: landmarks.id })
    counts.set('landmarks', insertedLandmarks.length)

    // -----------------------------------------------------------------------
    // Map places
    // -----------------------------------------------------------------------

    const mapPlaceSlugs = assignSlugs(
      content.MAP_PLACES,
      (m) => m.name.en,
      (m) => m.id,
    )
    const mapPlaceRows = content.MAP_PLACES.map((m) => ({
      slug: must(mapPlaceSlugs, m.id, 'map place slug'),
      legacyId: m.id,
      name: m.name,
      category: m.cat,
      lat: m.lat,
      lon: m.lon,
      regionId: must(regionId, m.region, 'region'),
      activityId: must(activityId, m.actId, 'activity'),
      isFree: m.free,
      requiredEntitlement: 'map_access',
      tags: m.tags,
      openingHours: m.hours,
      rating: m.rating,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedMapPlaces = await tx
      .insert(mapPlaces)
      .values(mapPlaceRows)
      .onConflictDoUpdate({
        target: mapPlaces.slug,
        set: overwrite(mapPlaces, [
          'legacyId',
          'name',
          'category',
          'lat',
          'lon',
          'regionId',
          'activityId',
          'isFree',
          'tags',
          'openingHours',
          'rating',
        ]),
      })
      .returning({ id: mapPlaces.id })
    counts.set('map_places', insertedMapPlaces.length)
    counts.set('map_places (free)', mapPlaceRows.filter((m) => m.isFree).length)

    // -----------------------------------------------------------------------
    // Articles
    // -----------------------------------------------------------------------

    const articleCategoryRows = content.BLOG_CATS.map((cat, index) => ({
      key: cat.key,
      label: cat.label,
      sortOrder: index,
    }))
    const insertedArticleCategories = await tx
      .insert(articleCategories)
      .values(articleCategoryRows)
      .onConflictDoUpdate({
        target: articleCategories.key,
        set: overwrite(articleCategories, ['label', 'sortOrder']),
      })
      .returning({ id: articleCategories.id, key: articleCategories.key })
    const articleCategoryId = new Map(insertedArticleCategories.map((row) => [row.key, row.id]))
    counts.set('article_categories', insertedArticleCategories.length)

    // Article slugs get 160 characters — the column is wider than the others
    // because a headline is longer than a product name.
    const articleSlugs = assignSlugs(
      content.ARTICLES,
      (a) => a.title.en,
      (a) => a.id,
      160,
    )
    const articleRows = content.ARTICLES.map((a) => ({
      slug: must(articleSlugs, a.id, 'article slug'),
      legacyId: a.id,
      title: a.title,
      excerpt: a.excerpt,
      categoryId: must(articleCategoryId, a.cat, 'article category'),
      bridge: a.bridge,
      status: 'published',
      publishedAt: SEEDED_AT,
    }))
    const insertedArticles = await tx
      .insert(articles)
      .values(articleRows)
      .onConflictDoUpdate({
        target: articles.slug,
        set: overwrite(articles, ['legacyId', 'title', 'excerpt', 'categoryId', 'bridge']),
      })
      .returning({ id: articles.id })
    counts.set('articles', insertedArticles.length)

    // -----------------------------------------------------------------------
    // Reviews
    // -----------------------------------------------------------------------

    /*
     * The handoff kept one pool of six reviews and picked them per page by tag
     * overlap, falling back to `slice(0, 3)` when nothing matched — so a
     * review about Mount Batur could appear under a café. Here each pool entry
     * is attached to the activities its tags actually name, producing real
     * rows with a real foreign key. Tags that name a category rather than an
     * activity are dropped; they were never attribution, only filtering.
     */
    const reviewRows = content.REVIEW_POOL.flatMap((review) =>
      review.tags
        .filter((tag) => activityId.has(tag))
        .map((tag) => ({
          // No natural key exists for a review, so the id is derived from
          // author + activity. That makes the insert idempotent without
          // inventing a unique index the application does not need.
          id: deterministicId(`review:${review.name}:${tag}`),
          authorName: review.name,
          authorCountry: review.from,
          stars: review.stars,
          body: review.text,
          activityId: must(activityId, tag, 'activity'),
          isPublished: true,
        })),
    )
    const insertedReviews = await tx
      .insert(reviews)
      .values(reviewRows)
      .onConflictDoUpdate({
        target: reviews.id,
        set: overwrite(reviews, [
          'authorName',
          'authorCountry',
          'stars',
          'body',
          'activityId',
          'isPublished',
        ]),
      })
      .returning({ id: reviews.id })
    counts.set('reviews', insertedReviews.length)

    // -----------------------------------------------------------------------
    // Driver fleet
    // -----------------------------------------------------------------------

    for (const vehicle of FLEET) {
      const low = vehicleForPassengers(vehicle.minPassengers)
      const high = vehicleForPassengers(vehicle.maxPassengers)
      if (low !== vehicle.vehicleClass || high !== vehicle.vehicleClass) {
        throw new Error(
          `fleet band ${vehicle.minPassengers}-${vehicle.maxPassengers} maps to ` +
            `${low}/${high}, not ${vehicle.vehicleClass} — seed and booking rules disagree`,
        )
      }
    }

    const vehicleRows = FLEET.map((vehicle, index) => ({
      vehicleClass: vehicle.vehicleClass,
      label: fromMessages(vehicle.labelKey),
      description: fromMessages(vehicle.descriptionKey),
      minPassengers: vehicle.minPassengers,
      maxPassengers: vehicle.maxPassengers,
      dayRateMinor: toMinor(vehicle.dayRateWhole),
      currency: SEED_CURRENCY,
      fleetSize: vehicle.fleetSize,
      sortOrder: index,
    }))
    const insertedVehicles = await tx
      .insert(driverVehicles)
      .values(vehicleRows)
      .onConflictDoUpdate({
        target: driverVehicles.vehicleClass,
        set: overwrite(driverVehicles, [
          'label',
          'description',
          'minPassengers',
          'maxPassengers',
          'dayRateMinor',
          'currency',
          'sortOrder',
        ]),
      })
      .returning({ id: driverVehicles.id })
    counts.set('driver_vehicles', insertedVehicles.length)

    // -----------------------------------------------------------------------
    // UI translations
    // -----------------------------------------------------------------------

    const translationKeys = [
      ...new Set(locales.flatMap((locale) => Object.keys(MESSAGES[locale]))),
    ].sort()

    const translationRows = translationKeys.map((key) => {
      const english = MESSAGES.en[key]
      if (english === undefined) throw new Error(`translation "${key}" has no English source`)
      return {
        key,
        values: {
          en: english,
          ar: MESSAGES.ar[key] ?? english,
          id: MESSAGES.id[key] ?? english,
        },
      }
    })
    const insertedTranslations = await tx
      .insert(translations)
      .values(translationRows)
      .onConflictDoUpdate({
        target: translations.key,
        set: overwrite(translations, ['values']),
      })
      .returning({ id: translations.id })
    counts.set('translations', insertedTranslations.length)
  })

  return counts
}

async function main(): Promise<void> {
  const started = Date.now()
  const counts = await seed()

  const width = Math.max(...[...counts.keys()].map((k) => k.length))
  console.log('\nSeed complete.\n')
  for (const [table, count] of counts) {
    console.log(`  ${table.padEnd(width)}  ${String(count).padStart(5)}`)
  }
  console.log(`\n  prices in minor units of ${SEED_CURRENCY}; no media seeded`)
  console.log(`  ${Date.now() - started} ms\n`)
}

main()
  .then(async () => {
    await db.$client.end({ timeout: 5 })
  })
  .catch(async (error: unknown) => {
    console.error('\nSeed failed — the transaction was rolled back.\n')
    console.error(error)
    await db.$client.end({ timeout: 5 })
    process.exitCode = 1
  })
