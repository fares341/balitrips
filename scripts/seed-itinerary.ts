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
 * levels once set, the status (unless --publish), a cover or gallery already
 * there, the areas and the page-content document once they exist, internal
 * notes and the map / VIP settings.
 *
 * Prices (owner, Nov 2026): 6 days 100, 8 days 150, 10 days 180 SAR — from
 * the seed, written on create or while the stored price is still 0. A new
 * itinerary is always a DRAFT; publish it in Studio (or with --publish).
 *
 * Images: `scripts/assets/itineraries/<audience><days>-cover.webp` and
 * `-galleryN.webp` go through the Studio media pipeline (`ingestImage`) with
 * deterministic media ids, and are attached only when the itinerary has no
 * cover (resp. no gallery) yet.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { and, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'

import { ingestImage } from '@/app/(admin)/_lib/image/pipeline'
import { db } from '@/db'
import {
  activities,
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  mapPlaces,
  media,
} from '@/db/schema'
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

const ASSETS = join(process.cwd(), 'scripts', 'assets', 'itineraries')

/** Same derivation as the data jobs: a stable UUID per file, so re-runs reuse the row. */
function stableMediaId(name: string): string {
  const hex = createHash('sha1').update(`bali-trips/itinerary-seed/${name}`).digest('hex')
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

/** The committed cover and gallery files for a seed, in order. */
function imageFiles(prefix: string): { cover: string | null; gallery: string[] } {
  if (!existsSync(ASSETS)) return { cover: null, gallery: [] }
  const files = readdirSync(ASSETS)
  const n = (f: string) => Number(/gallery(\d+)\.webp$/.exec(f)?.[1] ?? 0)
  return {
    cover: files.includes(`${prefix}-cover.webp`) ? `${prefix}-cover.webp` : null,
    gallery: files
      .filter((f) => f.startsWith(`${prefix}-gallery`) && f.endsWith('.webp'))
      .sort((a, b) => n(a) - n(b)),
  }
}

async function ingestFile(
  file: string,
  alt: { ar: string; en: string; id: string },
): Promise<string> {
  const mediaId = stableMediaId(file)
  const [have] = await db
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, mediaId), isNull(media.deletedAt)))
    .limit(1)
  if (have) return mediaId
  const result = await ingestImage({
    mediaId,
    bytes: new Uint8Array(readFileSync(join(ASSETS, file))),
    declaredMime: 'image/webp',
    declaredName: file,
  })
  const values = {
    objectKey: result.objectKey,
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    alt,
    name: file,
    credit: 'Bali Trips',
  }
  await db
    .insert(media)
    .values({ id: mediaId, ...values })
    .onConflictDoUpdate({
      target: media.id,
      set: { ...values, deletedAt: null, updatedAt: new Date() },
    })
  return mediaId
}

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
      areas: itineraries.areas,
      heroImageId: itineraries.heroImageId,
      galleryImageIds: itineraries.galleryImageIds,
    })
    .from(itineraries)
    .where(eq(itineraries.slug, seed.slug))
    .limit(1)

  const priceUnset =
    !existing || (existing.priceMinor === 0 && !hasSellablePrice(0, existing.tierPrices))
  const writesPrice = seed.priceMinor !== null && priceUnset
  const effectivePrice = writesPrice ? seed.priceMinor! : (existing?.priceMinor ?? 0)
  const seedAreas = { showNights: false, items: seed.areas.map((a) => ({ ...a })) }
  const writesAreas = !existing || existing.areas == null
  const images = imageFiles(`${seed.audienceKind}${seed.days.length}`)
  const writesCover = images.cover !== null && !existing?.heroImageId
  const writesGallery = images.gallery.length > 0 && (existing?.galleryImageIds ?? []).length === 0
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
      ? `exists: ${existing.id} (${existing.status}) — status kept`
      : 'new: will be created as a DRAFT',
  )
  console.log(
    writesPrice
      ? `price: ${effectivePrice / 100} SAR (set now)`
      : `price: ${effectivePrice / 100} SAR (kept — already priced, never overwritten)`,
  )
  console.log(
    `areas: ${seed.areas.map((a) => `${a.key} ${a.nights ?? '–'}`).join(' · ')} — ${writesAreas ? 'written (nights hidden)' : 'kept (already set)'}`,
  )
  console.log(
    `images: cover ${images.cover ?? 'none'} — ${writesCover ? 'attached' : 'kept / none'}; gallery ${images.gallery.length} — ${writesGallery ? 'attached' : 'kept / none'}`,
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

  // Media first (storage writes are not transactional); ids are deterministic.
  const alt = { ar: seed.public.name.ar, en: seed.public.name.en, id: seed.public.name.id }
  const coverId = writesCover ? await ingestFile(images.cover!, alt) : null
  const galleryIds: string[] = []
  if (writesGallery) for (const file of images.gallery) galleryIds.push(await ingestFile(file, alt))

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
          ...(writesPrice ? { priceMinor: seed.priceMinor! } : {}),
          ...(existing.pageContent == null ? { pageContent: pageContentFor(seed) } : {}),
          ...(writesAreas ? { areas: seedAreas } : {}),
          ...(coverId ? { heroImageId: coverId } : {}),
          ...(galleryIds.length > 0 ? { galleryImageIds: galleryIds } : {}),
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
          areas: seedAreas,
          heroImageId: coverId,
          galleryImageIds: galleryIds.length > 0 ? galleryIds : null,
          internalNotes: `Seeded from «${seed.sourceDocument}» pages ${seed.sourcePages}. Price per the owner's Nov 2026 list.`,
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
