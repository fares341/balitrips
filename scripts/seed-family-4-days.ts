/**
 * Seed «جدول العائلة 4 أيام» — the first real itinerary.
 *
 * Data and the public-copy rule live in `src/lib/itineraries/seeds/family-4-days.ts`
 * (unit-tested). This script only reads the catalog and writes the rows.
 *
 *   pnpm tsx scripts/seed-family-4-days.ts                 # dry run (default): prints the plan, writes nothing
 *   pnpm tsx scripts/seed-family-4-days.ts --apply         # upsert by slug, kept as a draft
 *   pnpm tsx scripts/seed-family-4-days.ts --apply --publish
 *   … --slug=<slug>                                        # another slug (default: family-4-days)
 *
 * Idempotent: the itinerary is upserted by slug (a re-run bumps `version`
 * only when it updates), its four days are upserted by (itinerary, day) and
 * each day's stops are replaced. Stops and activities are linked to EXISTING
 * catalog rows by name; a name that is not found (or matches more than one
 * row) is reported and left out, never created.
 *
 * Prices: 149 SAR «الجدول فقط». «الجدول + الخريطة» is 149 + the global map
 * bundle price (Studio → itinerary sales); the run prints that total.
 * Bundle discount: null (global default).
 */

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import {
  activities,
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  mapPlaces,
  plans,
} from '@/db/schema'
import { BOOKABLE_STATUSES } from '@/lib/content/activity-status'
import { mapBundleOffer } from '@/lib/itineraries/map-bundle'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import {
  FAMILY_4_DAYS_CURRENCY,
  FAMILY_4_DAYS_DAYS,
  FAMILY_4_DAYS_PRICE_MINOR,
  FAMILY_4_DAYS_PUBLIC as P,
  FAMILY_4_DAYS_SLUG,
  FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR,
  matchCatalog,
  type CatalogRow,
} from '@/lib/itineraries/seeds/family-4-days'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const publish = args.includes('--publish')
const slugArg = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length)
const slug = slugArg && /^[a-z0-9][a-z0-9-]{0,120}$/.test(slugArg) ? slugArg : FAMILY_4_DAYS_SLUG

const namesOf = (name: unknown): string[] =>
  name && typeof name === 'object'
    ? Object.values(name as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string',
      )
    : []

async function main() {
  const [placeRows, activityRows] = await Promise.all([
    db
      .select({ id: mapPlaces.id, name: mapPlaces.name })
      .from(mapPlaces)
      .where(isNull(mapPlaces.deletedAt)),
    db
      .select({ id: activities.id, name: activities.name })
      .from(activities)
      .where(and(isNull(activities.deletedAt), inArray(activities.status, [...BOOKABLE_STATUSES]))),
  ])
  const places: CatalogRow[] = placeRows.map((r) => ({ id: r.id, names: namesOf(r.name) }))
  const acts: CatalogRow[] = activityRows.map((r) => ({ id: r.id, names: namesOf(r.name) }))

  const report: string[] = []
  const notFound: string[] = []
  const plan = FAMILY_4_DAYS_DAYS.map((day) => {
    let activityId: string | null = null
    for (const name of day.activityNames) {
      const hit = matchCatalog(name, acts)
      if (hit.kind === 'found') {
        activityId = hit.id
        report.push(`day ${day.dayNumber}: activity «${name}» → ${hit.id}`)
        break
      }
      if (hit.kind === 'ambiguous')
        report.push(
          `day ${day.dayNumber}: activity «${name}» AMBIGUOUS (${hit.ids.length} rows) — skipped`,
        )
    }
    if (day.activityNames.length > 0 && activityId === null)
      notFound.push(`activity: ${day.activityNames[0]} (day ${day.dayNumber})`)
    const missing: (typeof day.stops)[number][] = []
    const stops = day.stops.flatMap((stop, index) => {
      const hit = matchCatalog(stop.name, places)
      if (hit.kind === 'found') {
        report.push(`day ${day.dayNumber}: place «${stop.name}» → ${hit.id}`)
        return [{ placeId: hit.id, sortOrder: index, note: stop.note }]
      }
      missing.push(stop)
      notFound.push(
        `place: ${stop.name} (day ${day.dayNumber})${hit.kind === 'ambiguous' ? ` — ambiguous, ${hit.ids.length} rows` : ''}`,
      )
      return []
    })
    // A stop not in the catalog stays in the private day text with the client's map link.
    const extra = (l: 'ar' | 'en' | 'id') =>
      missing.length === 0
        ? ''
        : `\n${missing.map((s) => `• ${s.name} — ${s.note[l]}: ${s.mapsUrl}`).join('\n')}`
    return {
      day,
      activityId,
      stops,
      description: {
        ar: day.description.ar + extra('ar'),
        en: day.description.en + extra('en'),
        id: day.description.id + extra('id'),
      },
    }
  })

  // Same inputs as the public page (`loadMapBundleOffer`), at the default FX
  // rates — that module is server-only and cannot load in a script.
  const mapPlans = await db
    .select({
      id: plans.id,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      kind: plans.entitlementKind,
      status: plans.status,
    })
    .from(plans)
    .where(and(inArray(plans.entitlementKind, ['map_access', 'vip']), isNull(plans.deletedAt)))
  const offer = mapBundleOffer(
    await readItinerarySales(),
    mapPlans.map((row) => ({ ...row, published: row.status === 'published' })),
  )
  const withMap = offer === null ? null : FAMILY_4_DAYS_PRICE_MINOR + offer.bundleMinor

  console.log(
    `\n«جدول العائلة 4 أيام» — slug ${slug} — ${apply ? 'APPLY' : 'DRY RUN (nothing written; add --apply)'}`,
  )
  console.log(
    `price: ${FAMILY_4_DAYS_PRICE_MINOR / 100} ${FAMILY_4_DAYS_CURRENCY} (itinerary only)`,
  )
  console.log(
    withMap === null
      ? 'with map: no map product on sale — the «+ map» option is hidden'
      : `with map: ${withMap / 100} SAR${withMap === FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR ? '' : `  ⚠ expected ${FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR / 100} — set the map bundle price in Studio → itinerary sales to ${(FAMILY_4_DAYS_WITH_MAP_TARGET_MINOR - FAMILY_4_DAYS_PRICE_MINOR) / 100} SAR`}`,
  )
  for (const line of report) console.log(`  ✓ ${line}`)
  console.log(
    notFound.length === 0
      ? 'all catalog names found'
      : `NOT FOUND in the catalog (${notFound.length}) — kept as text in the private day, not linked:`,
  )
  for (const line of notFound) console.log(`  ✗ ${line}`)

  if (!apply) return

  await db.transaction(async (tx) => {
    const values = {
      slug,
      name: P.name,
      blurb: P.blurb,
      detailedDescription: P.intro,
      days: FAMILY_4_DAYS_DAYS.length,
      tripType: P.tripType,
      audience: [...P.audience],
      priceMinor: FAMILY_4_DAYS_PRICE_MINOR,
      currency: FAMILY_4_DAYS_CURRENCY,
      tierPrices: null,
      includesMap: false,
      isVip: false,
      mapAccess: 'free_only',
      saleDigital: true,
      saleWithActivities: true,
      previewStats: P.stats.map((s) => ({ icon: s.icon, value: s.value, label: { ...s.label } })),
      teaserDaysVisible: FAMILY_4_DAYS_DAYS.length,
      isPopular: true,
      seoTitle: P.seoTitle,
      seoDescription: P.seoDescription,
      faq: P.faq.map((row) => ({ q: { ...row.q }, a: { ...row.a } })),
      bundleDiscountPct: null,
      linkedPlaceIds: [...new Set(plan.flatMap((d) => d.stops.map((s) => s.placeId)))],
      ...(publish ? { status: 'published', publishedAt: new Date() } : {}),
    }
    const { slug: _slug, ...update } = values
    void _slug
    const [row] = await tx
      .insert(itineraries)
      .values(values)
      .onConflictDoUpdate({
        target: itineraries.slug,
        set: { ...update, version: sql`${itineraries.version} + 1`, updatedAt: new Date() },
      })
      .returning({ id: itineraries.id, version: itineraries.version, status: itineraries.status })
    const itineraryId = row!.id

    await tx.delete(itineraryDays).where(
      and(
        eq(itineraryDays.itineraryId, itineraryId),
        notInArray(
          itineraryDays.dayNumber,
          FAMILY_4_DAYS_DAYS.map((d) => d.dayNumber),
        ),
      ),
    )
    for (const [index, entry] of plan.entries()) {
      const dayValues = {
        itineraryId,
        dayNumber: entry.day.dayNumber,
        activityId: entry.activityId,
        isFreeDay: entry.activityId === null,
        bookable: entry.activityId !== null,
        title: entry.day.title,
        description: entry.description,
        teaserMood: P.moods[index]!,
      }
      const [day] = await tx
        .insert(itineraryDays)
        .values(dayValues)
        .onConflictDoUpdate({
          target: [itineraryDays.itineraryId, itineraryDays.dayNumber],
          set: dayValues,
        })
        .returning({ id: itineraryDays.id })
      await tx.delete(itineraryDayPlaces).where(eq(itineraryDayPlaces.dayId, day!.id))
      if (entry.stops.length > 0) {
        await tx
          .insert(itineraryDayPlaces)
          .values(entry.stops.map((s) => ({ dayId: day!.id, ...s })))
      }
    }
    console.log(
      `\nwritten: itinerary ${itineraryId} v${row!.version} (${row!.status}), ${plan.length} days`,
    )
  })
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
