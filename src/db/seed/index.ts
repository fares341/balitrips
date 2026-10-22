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

import { inArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  activityCategories,
  articleCategories,
  articles,
  categories,
  driverVehicles,
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  itineraryPackageLinks,
  itineraryRegions,
  landmarks,
  mapPlaces,
  packageActivities,
  packageRegions,
  packages,
  placeTags,
  regions,
  tags,
  translations,
  type Localized,
} from '@/db/schema'
import { locales, type Locale } from '@/i18n/config'
import { vehicleForPassengers, type VehicleClass } from '@/lib/booking-rules'
import { syncPlaceAccess } from '@/lib/content/map-access'

import arMessages from '../../../messages/ar.json'
import enMessages from '../../../messages/en.json'
import idMessages from '../../../messages/id.json'
import contentJson from './content.json'
import { SEED_CURRENCY, assignSlugs, must, overwrite, toMinor } from './helpers'
import { seedRichContent } from './rich'
import type { ContentData } from './types'

const content = contentJson as unknown as ContentData

const MESSAGES: Record<Locale, Record<string, string>> = {
  en: enMessages,
  ar: arMessages,
  id: idMessages,
}

/** One timestamp for the whole run, so a seeded row set shares a publish time. */
const SEEDED_AT = new Date()

/** الأحياء التي تسميها الوثيقة (7.2)، داخل مناطق التصميم العامة. */
const SPEC_AREAS: readonly {
  key: string
  parent: string
  label: Localized
  lat: number
  lon: number
  radiusKm: number
}[] = [
  {
    key: 'kuta',
    parent: 'south',
    label: { en: 'Kuta', ar: 'كوتا', id: 'Kuta' },
    lat: -8.718,
    lon: 115.1686,
    radiusKm: 3,
  },
  {
    key: 'seminyak',
    parent: 'south',
    label: { en: 'Seminyak', ar: 'سمينياك', id: 'Seminyak' },
    lat: -8.6913,
    lon: 115.1683,
    radiusKm: 2.5,
  },
  {
    key: 'canggu',
    parent: 'south',
    label: { en: 'Canggu', ar: 'تشانغو', id: 'Canggu' },
    lat: -8.6478,
    lon: 115.1385,
    radiusKm: 4,
  },
  {
    key: 'uluwatu',
    parent: 'south',
    label: { en: 'Uluwatu', ar: 'أولواتو', id: 'Uluwatu' },
    lat: -8.8291,
    lon: 115.0849,
    radiusKm: 6,
  },
  {
    key: 'nusa-dua',
    parent: 'south',
    label: { en: 'Nusa Dua', ar: 'نوسا دوا', id: 'Nusa Dua' },
    lat: -8.8008,
    lon: 115.2317,
    radiusKm: 4,
  },
  {
    key: 'sanur',
    parent: 'south',
    label: { en: 'Sanur', ar: 'سانور', id: 'Sanur' },
    lat: -8.6878,
    lon: 115.262,
    radiusKm: 3,
  },
  {
    key: 'ubud',
    parent: 'central',
    label: { en: 'Ubud', ar: 'أوبود', id: 'Ubud' },
    lat: -8.5069,
    lon: 115.2625,
    radiusKm: 6,
  },
]

/** تصنيفات الخريطة من الوثيقة (6.2، 10.1) التي لا تغطيها تصنيفات الأنشطة. */
const SPEC_PLACE_CATEGORIES: readonly { key: string; label: Localized; tier: 'free' | 'vip' }[] = [
  {
    key: 'activities',
    label: { en: 'Activities', ar: 'الأنشطة والفعاليات', id: 'Aktivitas' },
    tier: 'free',
  },
  {
    key: 'sights',
    label: { en: 'Tourist sites', ar: 'المزارات السياحية', id: 'Tempat wisata' },
    tier: 'free',
  },
  {
    key: 'malls',
    label: { en: 'Malls & markets', ar: 'المولات والأسواق', id: 'Mal & pasar' },
    tier: 'free',
  },
  { key: 'restaurants', label: { en: 'Restaurants', ar: 'المطاعم', id: 'Restoran' }, tier: 'vip' },
  { key: 'cafes', label: { en: 'Cafés', ar: 'المقاهي', id: 'Kafe' }, tier: 'vip' },
  { key: 'spa', label: { en: 'Spa', ar: 'السبا', id: 'Spa' }, tier: 'vip' },
  {
    key: 'kids-care',
    label: { en: "Kids' nurseries", ar: 'حضانات الأطفال', id: 'Penitipan anak' },
    tier: 'vip',
  },
  {
    key: 'beauty',
    label: {
      en: "Beauty & ladies' salons",
      ar: 'مراكز التجميل والصالونات النسائية',
      id: 'Salon kecantikan',
    },
    tier: 'vip',
  },
  {
    key: 'waterfalls',
    label: { en: 'Bali waterfalls', ar: 'شلالات بالي', id: 'Air terjun Bali' },
    tier: 'vip',
  },
  {
    key: 'beaches',
    label: { en: 'Bali beaches', ar: 'شواطئ بالي', id: 'Pantai Bali' },
    tier: 'vip',
  },
  { key: 'barbers', label: { en: 'Barbers', ar: 'الحلاقين', id: 'Tukang cukur' }, tier: 'vip' },
  { key: 'hospital', label: { en: 'Hospitals', ar: 'مستشفيات', id: 'Rumah Sakit' }, tier: 'free' },
  { key: 'market', label: { en: 'Markets', ar: 'أسواق', id: 'Pasar' }, tier: 'free' },
  { key: 'shopping', label: { en: 'Shopping', ar: 'تسوق', id: 'Belanja' }, tier: 'free' },
  { key: 'events', label: { en: 'Events', ar: 'فعاليات', id: 'Acara' }, tier: 'free' },
]

/** وسوم الوثيقة (10.2). */
const SPEC_TAGS: readonly { key: string; label: Localized }[] = [
  {
    key: 'specialty-coffee',
    label: { en: 'Specialty Coffee', ar: 'قهوة مختصة', id: 'Kopi Spesialti' },
  },
  { key: 'burger', label: { en: 'Burger', ar: 'برجر', id: 'Burger' } },
  { key: 'pizza', label: { en: 'Pizza', ar: 'بيتزا', id: 'Pizza' } },
  { key: 'romantic', label: { en: 'Romantic', ar: 'رومانسي', id: 'Romantis' } },
  { key: 'family', label: { en: 'Family', ar: 'عائلي', id: 'Keluarga' } },
  { key: 'luxury', label: { en: 'Luxury', ar: 'فاخر', id: 'Mewah' } },
  { key: 'budget', label: { en: 'Budget', ar: 'اقتصادي', id: 'Hemat' } },
  { key: 'adventure', label: { en: 'Adventure', ar: 'مغامرة', id: 'Petualangan' } },
  {
    key: 'hidden-gems',
    label: { en: 'Hidden Gems', ar: 'جواهر مخفية', id: 'Permata Tersembunyi' },
  },
  {
    key: 'luxury-stays',
    label: { en: 'Luxury Stays', ar: 'إقامات فاخرة', id: 'Penginapan Mewah' },
  },
]

/** أماكن التصميم داخل أحيائها (المفتاح = معرّف التصميم). */
const PLACE_AREA: Record<string, string> = {
  canggu: 'canggu',
  uluwatu: 'uluwatu',
  ubud: 'ubud',
  tega: 'ubud',
}

/** التصنيف الرئيسي لكل مكان من التصميم — كي تعمل فلترة التصنيف من أول تنصيب. */
const PLACE_CATEGORY: Record<string, string> = {
  batur: 'activities',
  tega: 'sights',
  ubud: 'sights',
  canggu: 'beaches',
  uluwatu: 'sights',
  lempuyang: 'sights',
  penida: 'beaches',
  diamond: 'beaches',
  sekumpul: 'waterfalls',
}

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

    // الأحياء التي تسميها الوثيقة (7.2) داخل المناطق العامة — أماكن الخريطة
    // تُربط بها، وفلترة "جنوب بالي" تشملها.
    const areaRows = SPEC_AREAS.map((area, index) => ({
      key: area.key,
      label: area.label,
      parentId: must(regionId, area.parent, 'area parent'),
      centerLat: area.lat,
      centerLon: area.lon,
      radiusKm: area.radiusKm,
      sortOrder: 10 + index,
    }))
    const insertedAreas = await tx
      .insert(regions)
      .values(areaRows)
      .onConflictDoUpdate({
        target: regions.key,
        set: overwrite(regions, ['label', 'parentId', 'centerLat', 'centerLon', 'radiusKm']),
      })
      .returning({ id: regions.id, key: regions.key })
    for (const row of insertedAreas) regionId.set(row.key, row.id)
    counts.set('areas', insertedAreas.length)

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

    // تصنيفات الخريطة من الوثيقة (6.2، 10.1) غير الموجودة في تصنيفات الأنشطة.
    const insertedPlaceCategories = await tx
      .insert(categories)
      .values(
        SPEC_PLACE_CATEGORIES.map((cat, index) => ({
          key: cat.key,
          label: cat.label,
          sortOrder: 20 + index,
          // market / shopping / events stay filters of their own (folded into
          // malls and activities on the map), so only the first 12 are chips.
          mapTier: index < 12 ? cat.tier : null,
          mapOrder: index + 1,
        })),
      )
      .onConflictDoUpdate({
        target: categories.key,
        set: overwrite(categories, ['label', 'mapTier', 'mapOrder']),
      })
      .returning({ id: categories.id, key: categories.key })
    for (const row of insertedPlaceCategories) categoryId.set(row.key, row.id)

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

    // Phase 1 content for a few activities, from the facts above (fill-only).
    counts.set(
      'activity_rich_content',
      await seedRichContent(
        tx,
        activityId,
        new Map(content.ACTIVITIES.map((a) => [a.id, a.price])),
        SEED_CURRENCY,
      ),
    )

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
      // Phase 3, written on first insert only (not in the overwrite list):
      // the starter plans show every sale mode, and VIP as an optional extra.
      saleDigital: true,
      saleWithActivities: true,
      saleWithPackages: true,
      saleCustomRequest: true,
      mapAccess: 'vip_addon',
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
          // Sale mode B: the starter plans let every activity day be booked.
          bookable: linked !== null,
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
    const mapPlaceRows = content.MAP_PLACES.map((m) => {
      const placeCategory = PLACE_CATEGORY[m.id]
      return {
        slug: must(mapPlaceSlugs, m.id, 'map place slug'),
        legacyId: m.id,
        name: m.name,
        category: m.cat,
        lat: m.lat,
        lon: m.lon,
        regionId: must(regionId, PLACE_AREA[m.id] ?? m.region, 'region'),
        categoryId: placeCategory ? must(categoryId, placeCategory, 'place category') : null,
        activityId: must(activityId, m.actId, 'activity'),
        isFree: m.free,
        requiredEntitlement: 'map_access',
        tags: m.tags,
        openingHours: m.hours,
        rating: m.rating,
        status: 'published',
        publishedAt: SEEDED_AT,
      }
    })
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
          'categoryId',
          'activityId',
          'isFree',
          'tags',
          'openingHours',
          'rating',
        ]),
      })
      .returning({ id: mapPlaces.id, legacyId: mapPlaces.legacyId })
    counts.set('map_places', insertedMapPlaces.length)
    // Free or VIP follows the category (client, Oct 2026), as in migration 0027.
    await syncPlaceAccess(tx)

    // الوسوم في جدولها (place_tags). كانت الهجرة 0006 تنقلها من أماكن موجودة
    // قبل الـ seed فقط، فكان كل تنصيب جديد بلا وسوم وفلتر الوسوم فارغاً.
    const tagKeyOf = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    const tagLabels = new Map<string, Localized>()
    for (const filter of content.MAP_FILTERS) {
      if (filter.key !== 'All') tagLabels.set(tagKeyOf(filter.key), filter.label)
    }
    for (const tag of SPEC_TAGS) tagLabels.set(tag.key, tag.label)
    for (const m of content.MAP_PLACES) {
      for (const value of m.tags) {
        const key = tagKeyOf(value)
        if (key !== '' && !tagLabels.has(key))
          tagLabels.set(key, { en: value, ar: value, id: value })
      }
    }
    const insertedTags = await tx
      .insert(tags)
      .values([...tagLabels].map(([key, label], index) => ({ key, label, sortOrder: index })))
      .onConflictDoUpdate({ target: tags.key, set: { label: sql`excluded.label` } })
      .returning({ id: tags.id, key: tags.key })
    const tagId = new Map(insertedTags.map((row) => [row.key, row.id]))
    const placeId = new Map<string, string>()
    for (const row of insertedMapPlaces)
      if (row.legacyId !== null) placeId.set(row.legacyId, row.id)
    const placeTagRows = content.MAP_PLACES.flatMap((m) =>
      m.tags.map((value) => ({
        placeId: must(placeId, m.id, 'map place id'),
        tagId: must(tagId, tagKeyOf(value), 'tag id'),
      })),
    )
    if (placeTagRows.length > 0) {
      await tx.insert(placeTags).values(placeTagRows).onConflictDoNothing()
    }
    counts.set('tags', insertedTags.length)
    counts.set('place_tags', placeTagRows.length)

    /*
     * Phase 3: starter places on the first two days of each seeded plan, in
     * visiting order — a mix of free and members-only places, so the itinerary
     * page and the map's day view show both a pin and a lock. The days were
     * rewritten above, so their old places went with them (cascade).
     */
    const DAY_PLACES: Record<number, string[]> = {
      1: ['ubud', 'tega', 'uluwatu', 'canggu'],
      2: ['batur', 'lempuyang'],
    }
    const seededDays = await tx
      .select({ id: itineraryDays.id, dayNumber: itineraryDays.dayNumber })
      .from(itineraryDays)
      .where(inArray(itineraryDays.itineraryId, itineraryUuids))
    const dayPlaceRows = seededDays.flatMap((day) =>
      (DAY_PLACES[day.dayNumber] ?? []).flatMap((legacy, index) => {
        const id = placeId.get(legacy)
        return id === undefined ? [] : [{ dayId: day.id, placeId: id, sortOrder: index }]
      }),
    )
    if (dayPlaceRows.length > 0) {
      await tx.insert(itineraryDayPlaces).values(dayPlaceRows).onConflictDoNothing()
    }
    counts.set('itinerary_day_places', dayPlaceRows.length)

    // The first starter plan is also sold inside the first starter package.
    const firstItinerary = itineraryUuids[0]
    const firstPackage = packageUuids[0]
    if (firstItinerary !== undefined && firstPackage !== undefined) {
      await tx
        .insert(itineraryPackageLinks)
        .values({ itineraryId: firstItinerary, packageId: firstPackage, isDefault: true })
        .onConflictDoNothing()
    }
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
     * No reviews are seeded. The handoff's pool of six invented reviews was
     * shown as real ones (migration 0027 deleted them); an activity's rating
     * and review count now come only from reviews travellers wrote, kept in
     * step by a trigger on `reviews`.
     */
    counts.set('reviews', 0)

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
