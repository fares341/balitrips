/**
 * Seed one of the reviewed 6- and 8-day itineraries, by slug.
 *
 * Data and the public-copy rule live in `src/lib/itineraries/seeds/` (unit-
 * tested). This script only reads the catalog and writes the rows — the same
 * way `scripts/seed-family-4-days.ts` did for the first itinerary.
 *
 *   tsx scripts/seed-itinerary.ts                              # lists the slugs
 *   tsx scripts/seed-itinerary.ts --slug=bali-6d-youth         # dry run (default): prints the plan, writes nothing
 *   tsx scripts/seed-itinerary.ts --slug=bali-6d-youth --apply # upsert by slug; a NEW itinerary is a DRAFT
 *   … --apply --publish                                        # refused unless the itinerary has a price > 0
 *
 * Idempotent: the itinerary is upserted by slug, its days by (itinerary, day)
 * and each day's places are replaced. Places and activities are linked to
 * EXISTING catalog rows by name; a name that is not found (or matches more
 * than one row) is reported and never created — every stop, linked or not,
 * stays in the private day text with its original Google Maps link.
 *
 * What a re-run never overwrites (the owner's Studio work): the price and
 * levels, the status (unless --publish), images, the page-content document
 * once it exists, internal notes and the map / VIP settings.
 *
 * Prices: the sources have none. A new row is written with price 0 as a
 * DRAFT; 0 is never sellable (Studio publish and the checkout quote both
 * refuse it). Set the price in Studio, then publish there or with --publish.
 */

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import { db } from '@/db'
import { activities, itineraries, itineraryDayPlaces, itineraryDays, mapPlaces } from '@/db/schema'
import { BOOKABLE_STATUSES } from '@/lib/content/activity-status'
import { matchCatalog, type CatalogRow } from '@/lib/itineraries/seeds/family-4-days'
import {
  hasSellablePrice,
  ITINERARY_SEEDS,
  mapsUrlIssue,
  pageContentFor,
  privateDayText,
  seedBySlug,
} from '@/lib/itineraries/seeds'

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const publish = args.includes('--publish')
const slug = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length) ?? ''

const namesOf = (name: unknown): string[] =>
  name && typeof name === 'object'
    ? Object.values(name as Record<string, unknown>).filter(
        (v): v is string => typeof v === 'string',
      )
    : []

async function main(): Promise<number> {
  const seed = seedBySlug(slug)
  if (!seed) {
    console.log(
      `Usage: --slug=<slug> [--apply] [--publish]\nslugs: ${ITINERARY_SEEDS.map((s) => s.slug).join(', ')}`,
    )
    return slug === '' ? 0 : 1
  }
  if (publish && !apply) {
    console.error('--publish needs --apply')
    return 1
  }

  const [existing] = await db
    .select({
      id: itineraries.id,
      priceMinor: itineraries.priceMinor,
      tierPrices: itineraries.tierPrices,
      status: itineraries.status,
      pageContent: itineraries.pageContent,
    })
    .from(itineraries)
    .where(eq(itineraries.slug, seed.slug))
    .limit(1)

  const effectivePrice = seed.priceMinor ?? existing?.priceMinor ?? 0
  if (publish && !hasSellablePrice(effectivePrice, existing?.tierPrices)) {
    console.error(
      `REFUSED: «${seed.slug}» has no price (> 0). Set the price in Studio first — it is never published or sold at 0.`,
    )
    return 1
  }

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

  const found: string[] = []
  const notFound: string[] = []
  const linkIssues: string[] = []
  const plan = seed.days.map((day) => {
    let activityId: string | null = null
    for (const name of day.activityNames) {
      const hit = matchCatalog(name, acts)
      if (hit.kind === 'found') {
        activityId = hit.id
        found.push(`day ${day.dayNumber}: activity «${name}» → ${hit.id}`)
        break
      }
    }
    if (day.activityNames.length > 0 && activityId === null)
      notFound.push(
        `activity: ${day.activityNames[0]} (day ${day.dayNumber}) — day stays a free day`,
      )
    const seen = new Set<string>()
    const stops = day.stops.flatMap((stop, index) => {
      const issue = mapsUrlIssue(stop.mapsUrl)
      if (issue)
        linkIssues.push(`day ${day.dayNumber}: ${stop.name} — ${issue}: ${stop.mapsUrl ?? '—'}`)
      const hit = matchCatalog(stop.name, places)
      if (hit.kind === 'found' && !seen.has(hit.id)) {
        seen.add(hit.id)
        found.push(`day ${day.dayNumber}: place «${stop.name}» → ${hit.id}`)
        return [{ placeId: hit.id, sortOrder: index, note: { ...stop.note } }]
      }
      notFound.push(
        `place: ${stop.name} (day ${day.dayNumber})${hit.kind === 'ambiguous' ? ` — ambiguous, ${hit.ids.length} rows` : ''}`,
      )
      return []
    })
    return {
      day,
      activityId,
      stops,
      description: {
        ar: privateDayText(day, 'ar'),
        en: privateDayText(day, 'en'),
        id: privateDayText(day, 'id'),
      },
    }
  })

  const stopCount = seed.days.reduce((n, d) => n + d.stops.length, 0)
  console.log(
    `\n«${seed.public.name.ar}» — slug ${seed.slug} — ${apply ? 'APPLY' : 'DRY RUN (nothing written; add --apply)'}`,
  )
  console.log(`source: ${seed.sourceDocument}, pages ${seed.sourcePages}`)
  console.log(
    `${seed.days.length} days, ${stopCount} stops, ${stopCount - linkIssues.length} well-formed map links`,
  )
  console.log(
    existing
      ? `exists: ${existing.id} (${existing.status}), price ${existing.priceMinor / 100} SAR — price and status kept`
      : 'new: will be created as a DRAFT with no price (0 = not sellable)',
  )
  for (const line of found) console.log(`  ✓ ${line}`)
  console.log(
    notFound.length === 0
      ? 'all catalog names found'
      : `NOT FOUND in the catalog (${notFound.length}) — kept as text + map link in the private day, not linked:`,
  )
  for (const line of notFound) console.log(`  ✗ ${line}`)
  for (const line of linkIssues) console.log(`  ⚠ link ${line}`)

  if (!apply) return 0

  await db.transaction(async (tx) => {
    const p = seed.public
    const copy = {
      name: p.name,
      blurb: p.blurb,
      detailedDescription: p.intro,
      days: seed.days.length,
      tripType: p.tripType,
      audience: p.audience.map((a) => ({ ...a })),
      previewStats: p.stats.map((s) => ({ icon: s.icon, value: s.value, label: { ...s.label } })),
      teaserDaysVisible: seed.days.length,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      faq: p.faq.map((row) => ({ q: { ...row.q }, a: { ...row.a } })),
      linkedPlaceIds: [...new Set(plan.flatMap((d) => d.stops.map((s) => s.placeId)))],
    }
    const publishing = publish ? { status: 'published', publishedAt: new Date() } : {}
    let itineraryId: string
    if (existing) {
      const [row] = await tx
        .update(itineraries)
        .set({
          ...copy,
          ...(seed.priceMinor !== null ? { priceMinor: seed.priceMinor } : {}),
          ...(existing.pageContent == null ? { pageContent: pageContentFor(seed) } : {}),
          ...publishing,
          version: sql`${itineraries.version} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(itineraries.id, existing.id))
        .returning({ id: itineraries.id })
      itineraryId = row!.id
    } else {
      const [row] = await tx
        .insert(itineraries)
        .values({
          slug: seed.slug,
          ...copy,
          priceMinor: seed.priceMinor ?? 0,
          currency: seed.currency,
          tierPrices: null,
          includesMap: false,
          isVip: false,
          mapAccess: 'free_only',
          saleDigital: true,
          saleWithActivities: true,
          isPopular: false,
          bundleDiscountPct: null,
          pageContent: pageContentFor(seed),
          internalNotes: `Seeded from «${seed.sourceDocument}» pages ${seed.sourcePages}. No price in the source.`,
          ...publishing,
        })
        .returning({ id: itineraries.id })
      itineraryId = row!.id
    }

    await tx.delete(itineraryDays).where(
      and(
        eq(itineraryDays.itineraryId, itineraryId),
        notInArray(
          itineraryDays.dayNumber,
          seed.days.map((d) => d.dayNumber),
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
        teaserMood: seed.public.moods[index]!,
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
    const [after] = await tx
      .select({ status: itineraries.status, version: itineraries.version })
      .from(itineraries)
      .where(eq(itineraries.id, itineraryId))
    console.log(
      `\nwritten: itinerary ${itineraryId} v${after!.version} (${after!.status}), ${plan.length} days`,
    )
  })
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
