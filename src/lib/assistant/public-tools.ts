/**
 * The website assistant's tools.
 *
 * Every tool calls the site's EXISTING query and domain functions (through
 * `PublicDeps`, so the tests can swap them for fakes) — never SQL of its own —
 * and enforces its own authorization from the server-built context:
 *
 *  - `ctx.userId` and `ctx.held` come from the session cookie, not the model.
 *    No tool takes a user id, an order id of someone else, or an
 *    entitlement as an argument.
 *  - Map places go through the same redaction as the map: `searchPlaces`
 *    (text and location are never matched against locked places, which come
 *    back as a count) and `canSeePlace` for a single place. A locked place
 *    and a missing one get the SAME answer, so the tool is not an oracle for
 *    which slugs exist.
 *  - Prices are only ever what `buildQuote` / the catalogue says, formatted
 *    on the server.
 *  - Writes are proposals: `propose_*` stores the validated arguments and
 *    returns a card; nothing runs until the visitor presses Confirm.
 *
 * Imports here are types, zod and pure helpers only — no database — so the
 * unit tests can load this module.
 */

import { z } from 'zod'

import type { Locale } from '@/i18n/config'
import { BUDGET_TIERS } from '@/lib/budget-tier'
import { pick } from '@/lib/content/localize'
import type {
  ActivityDetail,
  ActivitySummary,
  CategoryDto,
  DriverVehicleDto,
  ItineraryDetail,
  ItinerarySummary,
  PackageDetail,
  PackageSummary,
  RegionDto,
  SearchHit,
} from '@/lib/content/types'
import {
  canSeePlace,
  placeAccess,
  type EntitlementSet,
  type FullMapPlace,
} from '@/lib/entitlements/redaction'
import { FEATURES } from '@/lib/features'
import { formatMoney } from '@/lib/money'
import type { PlaceSearchInput, PlaceSearchResult } from '@/lib/search/places'

import type { AssistantTool, ToolResult } from './engine'

/* --------------------------------------------------------------------------
   Context and dependencies
   -------------------------------------------------------------------------- */

export interface BookingDraft {
  activityId: string
  packageId: string | null
  date: string
  endDate: string | null
  time: string | null
  people: number
  addons: { id: string; qty: number }[]
  driver: boolean
}

export interface QuoteOutcome {
  ok: boolean
  totalMinor: number
  currency: string
  issues: { code: string; driver?: boolean }[]
  lines: {
    kind: string
    refId: string | null
    totalMinor: number
    currency: string
    quantity: number
    included?: boolean
  }[]
}

export interface TripView {
  itemCount: number
  totalMinor: number
  currency: string
  ok: boolean
  lines: {
    name: Record<string, string> | null
    kind: string
    travelDate: string | null
    travelTime: string | null
    guests: number | null
    lineTotalMinor: number | null
    currency: string | null
    issue: string | null
  }[]
}

export interface OrderView {
  orderNumber: string
  date: string
  status: string
  totalMinor: number
  currency: string
  items: {
    name: Record<string, string> | null
    kind: string
    bookingStatus: string
    travelDate: string | null
  }[]
}

export interface PublicDeps {
  search(q: string, locale: Locale): Promise<SearchHit[]>
  listActivities(options: {
    categoryKey?: string | null
    sort?: 'top' | 'price' | null
    limit?: number
    locale: Locale
  }): Promise<ActivitySummary[]>
  getActivity(slug: string): Promise<ActivityDetail | null>
  listPackages(): Promise<PackageSummary[]>
  getPackage(slug: string): Promise<PackageDetail | null>
  listItineraries(): Promise<ItinerarySummary[]>
  getItinerary(slug: string): Promise<ItineraryDetail | null>
  taxonomy(): Promise<{ regions: RegionDto[]; categories: CategoryDto[] }>
  searchPlaces(
    input: PlaceSearchInput,
    held: EntitlementSet,
    locale: Locale,
  ): Promise<PlaceSearchResult>
  findPlace(slug: string): Promise<FullMapPlace | null>
  drivers(): Promise<DriverVehicleDto[]>
  policy(
    id: 'terms' | 'privacy' | 'refund' | 'cookies',
  ): Promise<{ updated: string; body: Record<string, string> }>
  contact(): Promise<{ whatsapp: string | null; email: string }>
  messages(locale: Locale): Promise<Record<string, string>>
  faqKeys(): readonly { title: string; items: readonly { q: string; a: string }[] }[]
  quote(draft: BookingDraft): Promise<QuoteOutcome>
  myTrip(): Promise<TripView | null>
  myOrders(userId: string): Promise<OrderView[]>
  createAction(input: {
    conversationId: string
    kind: string
    args: Record<string, unknown>
    summary: Record<string, unknown>
  }): Promise<string>
}

export interface PublicCtx {
  locale: Locale
  /** From the session, never from the model. */
  userId: string | null
  /** The viewer's live entitlements (map plans), from the session. */
  held: EntitlementSet
  conversationId: string
  deps: PublicDeps
}

/* --------------------------------------------------------------------------
   Helpers
   -------------------------------------------------------------------------- */

const money = (minor: number, currency: string) => formatMoney(minor, currency, 'en')
const SLUG = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/i, 'a slug like ubud-rice-terraces')
const KEY = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/i)
const UUID = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    'an id returned by a tool',
  )
const DATE = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const TIME = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}$/, 'HH:mm')

function clip(text: string | null | undefined, max: number): string | null {
  if (!text) return null
  const clean = text.replace(/\s+/g, ' ').trim()
  return clean.length > max ? `${clean.slice(0, max)}…` : clean
}

function mapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(5)},${lon.toFixed(5)}`
}

function activityCard(a: ActivitySummary, locale: Locale) {
  return {
    name: pick(a.name, locale, a.slug),
    slug: a.slug,
    href: a.href,
    area: a.area ? pick(a.area, locale) : null,
    region: a.region ? pick(a.region.label, locale, a.region.key) : null,
    duration: a.duration ? pick(a.duration, locale) : null,
    categories: a.categories.map((c) => pick(c.label, locale, c.key)),
    priceFrom: money(a.priceMinor, a.currency),
    // Real data only: no rating is better than an invented one.
    ...(a.rating !== null && a.reviewCount > 0 ? { rating: a.rating, reviews: a.reviewCount } : {}),
  }
}

type Tool = AssistantTool<PublicCtx>

function tool<S extends z.ZodType>(spec: {
  name: string
  description: string
  parameters: Record<string, unknown>
  schema: S
  run: (args: z.infer<S>, ctx: PublicCtx) => Promise<ToolResult>
}): Tool {
  return spec as unknown as Tool
}

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: 'object',
  properties,
  required,
  additionalProperties: false,
})

/* --------------------------------------------------------------------------
   Catalogue
   -------------------------------------------------------------------------- */

const searchSite = tool({
  name: 'search_site',
  description:
    'Search the whole site (activities, itineraries, packages, articles, free map places) by text. Use first for a named thing.',
  parameters: obj({ query: { type: 'string', description: 'Words to search, any language' } }, [
    'query',
  ]),
  schema: z.object({ query: z.string().trim().min(1).max(80) }),
  run: async ({ query }, ctx) => {
    const hits = await ctx.deps.search(query, ctx.locale)
    return {
      data: {
        results: hits.slice(0, 12).map((hit) => ({
          type: hit.type,
          title: pick(hit.title, ctx.locale, hit.slug),
          subtitle: hit.subtitle ? pick(hit.subtitle, ctx.locale) : null,
          slug: hit.slug,
          href: hit.href,
          ...(hit.days !== null ? { days: hit.days } : {}),
        })),
      },
    }
  },
})

const listActivitiesTool = tool({
  name: 'list_activities',
  description:
    'List bookable activities, optionally by category key (from list_regions_categories). Sort "top" (rating) or "price" (cheapest first).',
  parameters: obj({
    category: { type: 'string', description: 'categories.key, optional' },
    sort: { type: 'string', enum: ['top', 'price'] },
    limit: { type: 'integer', minimum: 1, maximum: 12 },
  }),
  schema: z.object({
    category: KEY.optional(),
    sort: z.enum(['top', 'price']).optional(),
    limit: z.number().int().min(1).max(12).optional(),
  }),
  run: async ({ category, sort, limit }, ctx) => {
    const rows = await ctx.deps.listActivities({
      categoryKey: category ?? null,
      sort: sort ?? null,
      limit: limit ?? 8,
      locale: ctx.locale,
    })
    return { data: { activities: rows.map((a) => activityCard(a, ctx.locale)) } }
  },
})

const getActivityTool = tool({
  name: 'get_activity',
  description:
    'Full details of one activity by slug: packages (with ids and prices), add-ons, time slots, lead time, max guests, inclusions, FAQ, cancellation policy.',
  parameters: obj({ slug: { type: 'string' } }, ['slug']),
  schema: z.object({ slug: SLUG }),
  run: async ({ slug }, ctx) => {
    const a = await ctx.deps.getActivity(slug)
    if (!a) return { data: { found: false } }
    const L = ctx.locale
    return {
      data: {
        found: true,
        id: a.id,
        ...activityCard(a, L),
        description: clip(a.description ? pick(a.description, L) : null, 700),
        multiDay: a.multiDay,
        timeSlots: a.timeSlots,
        leadTimeHours: a.leadTimeHours,
        maxGuests: a.maxGuests,
        included: a.included
          .map((x) => pick(x, L))
          .filter(Boolean)
          .slice(0, 10),
        excluded: a.excluded
          .map((x) => pick(x, L))
          .filter(Boolean)
          .slice(0, 10),
        cancellationPolicy: clip(a.cancellationPolicy ? pick(a.cancellationPolicy, L) : null, 400),
        packages: a.tiers.map((t) => ({
          id: t.id,
          name: pick(t.name, L, t.key),
          price: money(t.priceMinor, t.currency),
          pricing: t.pricing,
          ...(t.groupMax !== null ? { groupMax: t.groupMax } : {}),
          ...(t.maxGuests !== null ? { maxGuests: t.maxGuests } : {}),
          available: t.available,
          includes: t.includes
            .map((x) => pick(x, L))
            .filter(Boolean)
            .slice(0, 8),
        })),
        addons: a.addons.map((x) => ({
          id: x.id,
          name: pick(x.name, L),
          price: money(x.priceMinor, x.currency),
          pricing: x.pricing,
          available: x.available,
          ...(x.maxQty !== null ? { maxQty: x.maxQty } : {}),
          ...(x.onlyPackages.length > 0 ? { onlyForPackageIds: x.onlyPackages } : {}),
          ...(x.requiresAddonId ? { requiresAddonId: x.requiresAddonId } : {}),
        })),
        faq: a.faq.slice(0, 6).map((f) => ({ q: pick(f.q, L), a: clip(pick(f.a, L), 300) })),
      },
    }
  },
})

const packagesTool = tool({
  name: 'packages',
  description:
    'Multi-day trip packages: list them, or pass a slug for one package with its activities.',
  parameters: obj({ slug: { type: 'string', description: 'optional' } }),
  schema: z.object({ slug: SLUG.optional() }),
  run: async ({ slug }, ctx) => {
    const L = ctx.locale
    const card = (p: PackageSummary) => ({
      name: pick(p.name, L, p.slug),
      slug: p.slug,
      href: p.href,
      days: p.days,
      maxGuests: p.maxGuests,
      driverIncluded: p.driverIncluded,
      price: money(p.priceMinor, p.currency),
      pricing: p.pricingMode === 'per_guest' ? 'per person' : 'per group',
      regions: p.regions.map((r) => pick(r.label, L, r.key)),
      blurb: clip(p.blurb ? pick(p.blurb, L) : null, 200),
    })
    if (slug) {
      const p = await ctx.deps.getPackage(slug)
      if (!p) return { data: { found: false } }
      return {
        data: {
          found: true,
          ...card(p),
          included: p.included
            .map((x) => pick(x, L))
            .filter(Boolean)
            .slice(0, 10),
          excluded: p.excluded
            .map((x) => pick(x, L))
            .filter(Boolean)
            .slice(0, 10),
          activities: p.activities.map((a) => activityCard(a, L)),
        },
      }
    }
    return { data: { packages: (await ctx.deps.listPackages()).slice(0, 12).map(card) } }
  },
})

const itinerariesTool = tool({
  name: 'itineraries',
  description:
    'Ready-made day-by-day itineraries (digital plans): list them, or pass a slug for one (summary and day titles).',
  parameters: obj({ slug: { type: 'string', description: 'optional' } }),
  schema: z.object({ slug: SLUG.optional() }),
  run: async ({ slug }, ctx) => {
    const L = ctx.locale
    const card = (i: ItinerarySummary) => ({
      name: pick(i.name, L, i.slug),
      slug: i.slug,
      href: i.href,
      days: i.days,
      price: money(i.priceMinor, i.currency),
      tripType: i.tripType ? pick(i.tripType, L) : null,
      regions: i.regions.map((r) => pick(r.label, L, r.key)),
      blurb: clip(i.blurb ? pick(i.blurb, L) : null, 200),
    })
    if (slug) {
      const i = await ctx.deps.getItinerary(slug)
      if (!i) return { data: { found: false } }
      return {
        data: {
          found: true,
          ...card(i),
          includesMap: i.includesMap,
          vip: i.isVip,
          dayTitles: i.dayPlans
            .slice(0, 14)
            .map((d) =>
              d.title ? pick(d.title, L) : d.activity ? pick(d.activity.name, L) : null,
            ),
        },
      }
    }
    return { data: { itineraries: (await ctx.deps.listItineraries()).slice(0, 12).map(card) } }
  },
})

const taxonomyTool = tool({
  name: 'list_regions_categories',
  description:
    'The regions/areas of Bali and the activity/place categories, with their keys for other tools.',
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => {
    const { regions, categories } = await ctx.deps.taxonomy()
    return {
      data: {
        regions: regions
          .slice(0, 40)
          .map((r) => ({ key: r.key, name: pick(r.label, ctx.locale, r.key) })),
        categories: categories
          .slice(0, 40)
          .map((c) => ({ key: c.key, name: pick(c.label, ctx.locale, c.key) })),
      },
    }
  },
})

const driversTool = tool({
  name: 'driver_info',
  description:
    'Private driver service: vehicle classes, passengers per vehicle and the price per day.',
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => {
    const rows = await ctx.deps.drivers()
    return {
      data: {
        bookAt: '/driver',
        vehicles: rows.map((v) => ({
          class: v.vehicleClass,
          name: pick(v.label, ctx.locale, v.vehicleClass),
          passengers: `${v.minPassengers}–${v.maxPassengers}`,
          pricePerDay: money(v.dayRateMinor, v.currency),
        })),
      },
    }
  },
})

/* --------------------------------------------------------------------------
   Map places (redacted exactly like the map)
   -------------------------------------------------------------------------- */

const searchPlacesTool = tool({
  name: 'search_places',
  description:
    'Search map places (cafes, beaches, temples, hidden gems…) by words, region key and/or category key. Only places this visitor has unlocked are returned; locked ones come back only as a count.',
  parameters: obj({
    query: { type: 'string', description: 'e.g. "cafes in Canggu"' },
    region: { type: 'string', description: 'regions.key, optional' },
    category: { type: 'string', description: 'categories.key, optional' },
    hiddenGems: { type: 'boolean' },
  }),
  schema: z.object({
    query: z.string().trim().max(80).optional(),
    region: KEY.optional(),
    category: KEY.optional(),
    hiddenGems: z.boolean().optional(),
  }),
  run: async ({ query, region, category, hiddenGems }, ctx) => {
    const result = await ctx.deps.searchPlaces(
      {
        q: query ?? null,
        region: region ?? null,
        category: category ?? null,
        gemsOnly: hiddenGems === true,
        near: null,
        limit: 10,
      },
      ctx.held,
      ctx.locale,
    )
    return { data: placesForModel(result) }
  },
})

/**
 * What the model may see of a place search. Exported for the tests: only
 * `locked: false` hits exist in the result by construction, and the locked
 * remainder is a number.
 */
export function placesForModel(result: PlaceSearchResult) {
  return {
    places: result.hits
      .filter((hit) => hit.locked === false)
      .map((hit) => ({
        name: hit.name,
        slug: hit.slug,
        href: `/map?place=${encodeURIComponent(hit.slug)}`,
        category: hit.category,
        region: hit.region,
        hiddenGem: hit.isHiddenGem,
        googleMaps: mapsUrl(hit.lat, hit.lon),
      })),
    lockedCount: result.lockedCount,
    ...(result.lockedCount > 0
      ? {
          lockedNote:
            'More places match but are locked for this visitor; unlock with a map plan at /plans.',
        }
      : {}),
  }
}

const getPlaceTool = tool({
  name: 'get_place',
  description: 'Details of one map place by slug, if this visitor can see it.',
  parameters: obj({ slug: { type: 'string' } }, ['slug']),
  schema: z.object({ slug: SLUG }),
  run: async ({ slug }, ctx) => ({
    data: placeForModel(await ctx.deps.findPlace(slug), ctx.held, ctx.locale),
  }),
})

/**
 * One place, or the same "not available" answer for locked and missing
 * places — so asking for slugs one by one reveals nothing.
 */
export function placeForModel(place: FullMapPlace | null, held: EntitlementSet, locale: Locale) {
  if (place === null || !canSeePlace(place, held)) {
    return {
      available: false,
      note: 'No details available to this visitor. Some places are only shown with a map plan (/plans).',
    }
  }
  const access = placeAccess(place)
  return {
    available: true,
    name: pick(place.name, locale, place.slug),
    slug: place.slug,
    href: `/map?place=${encodeURIComponent(place.slug)}`,
    category: place.categoryLabel
      ? pick(place.categoryLabel, locale)
      : place.category
        ? pick(place.category, locale)
        : null,
    region: place.regionLabel ? pick(place.regionLabel, locale) : null,
    description: clip(place.description ? pick(place.description, locale) : null, 500),
    openingHours: place.openingHours,
    hiddenGem: place.isHiddenGem,
    free: access.isFree,
    googleMaps: mapsUrl(place.lat, place.lon),
    ...(place.activitySlug ? { relatedActivity: `/activities/${place.activitySlug}` } : {}),
  }
}

/* --------------------------------------------------------------------------
   Site pages: FAQ, policies, about, contact
   -------------------------------------------------------------------------- */

const SITE_TOPICS = ['faq', 'about', 'contact', 'terms', 'privacy', 'refund', 'cookies'] as const

const siteInfoTool = tool({
  name: 'site_info',
  description:
    'Text of a site page: faq, about, contact (WhatsApp/email), terms, privacy, refund (cancellation and refunds), cookies.',
  parameters: obj({ topic: { type: 'string', enum: [...SITE_TOPICS] } }, ['topic']),
  schema: z.object({ topic: z.enum(SITE_TOPICS) }),
  run: async ({ topic }, ctx) => {
    if (topic === 'contact') {
      const contact = await ctx.deps.contact()
      return { data: { page: '/contact', whatsapp: contact.whatsapp, email: contact.email } }
    }
    if (topic === 'faq' || topic === 'about') {
      const m = await ctx.deps.messages(ctx.locale)
      if (topic === 'about') {
        return {
          data: {
            page: '/about',
            text: ['about_p1', 'about_p2', 'about_vision', 'about_mission']
              .map((key) => m[key] ?? '')
              .filter(Boolean),
          },
        }
      }
      return {
        data: {
          page: '/faq',
          faq: ctx.deps
            .faqKeys()
            .flatMap((group) =>
              group.items.map((item) => ({ q: m[item.q] ?? '', a: clip(m[item.a] ?? '', 500) })),
            ),
        },
      }
    }
    const policy = await ctx.deps.policy(topic)
    const body = policy.body[ctx.locale] || policy.body.en || ''
    return {
      data: { page: `/${topic}`, effective: policy.updated, text: clip(body, 3000) },
    }
  },
})

/* --------------------------------------------------------------------------
   Prices
   -------------------------------------------------------------------------- */

const bookingShape = {
  activitySlug: SLUG,
  packageId: UUID.optional(),
  date: DATE,
  endDate: DATE.optional(),
  time: TIME.optional(),
  people: z.number().int().min(1).max(30),
  addons: z
    .array(z.object({ id: UUID, qty: z.number().int().min(1).max(30) }))
    .max(20)
    .optional(),
  driver: z.boolean().optional(),
}
const bookingSchema = z.object(bookingShape)
type BookingArgs = z.infer<typeof bookingSchema>

const bookingParameters = obj(
  {
    activitySlug: { type: 'string' },
    packageId: {
      type: 'string',
      description: 'package id from get_activity (omit for the base price)',
    },
    date: { type: 'string', description: 'YYYY-MM-DD (Bali date)' },
    endDate: { type: 'string', description: 'YYYY-MM-DD, multi-day activities only' },
    time: { type: 'string', description: 'HH:mm, one of the time slots' },
    people: { type: 'integer', minimum: 1, maximum: 30 },
    addons: {
      type: 'array',
      items: obj({ id: { type: 'string' }, qty: { type: 'integer', minimum: 1 } }, ['id', 'qty']),
    },
    driver: { type: 'boolean', description: 'add a private driver for the same day(s)' },
  },
  ['activitySlug', 'date', 'people'],
)

/** Resolve, price and describe a booking. Shared by the quote and the proposal. */
async function priceBooking(args: BookingArgs, ctx: PublicCtx) {
  const activity = await ctx.deps.getActivity(args.activitySlug)
  if (!activity) return { ok: false as const, data: { error: 'unknown_activity' } }
  const draft: BookingDraft = {
    activityId: activity.id,
    packageId: args.packageId ?? null,
    date: args.date,
    endDate: args.endDate ?? null,
    time: args.time ?? null,
    people: args.people,
    addons: args.addons ?? [],
    driver: FEATURES.driver && args.driver === true,
  }
  const quote = await ctx.deps.quote(draft)
  if (!quote.ok) {
    return {
      ok: false as const,
      data: {
        priced: false,
        problems: quote.issues.map((issue) =>
          issue.driver ? `driver: ${issue.code}` : issue.code,
        ),
        hint: 'Explain the problem (e.g. pick an offered time slot, a later date, fewer people) and ask again.',
      },
    }
  }
  const L = ctx.locale
  const tier = activity.tiers.find((t) => t.id === draft.packageId) ?? null
  const addonName = (id: string | null) => {
    const addon = activity.addons.find((x) => x.id === id)
    return addon ? pick(addon.name, L) : 'add-on'
  }
  const lines = quote.lines.map((line) => ({
    item:
      line.kind === 'package'
        ? tier
          ? pick(tier.name, L, tier.key)
          : pick(activity.name, L, activity.slug)
        : line.kind === 'driver'
          ? 'Private driver'
          : addonName(line.refId),
    quantity: line.quantity,
    amount: line.included ? 'included' : money(line.totalMinor, line.currency),
  }))
  return {
    ok: true as const,
    activity,
    tier,
    draft,
    total: money(quote.totalMinor, quote.currency),
    lines,
    addonNames: draft.addons.map((a) => `${addonName(a.id)}${a.qty > 1 ? ` ×${a.qty}` : ''}`),
  }
}

const quoteTool = tool({
  name: 'quote_activity',
  description:
    'Exact server-computed price for one activity booking (date, people, optional package, time, add-ons, driver). Also checks the booking is possible.',
  parameters: bookingParameters,
  schema: bookingSchema,
  run: async (args, ctx) => {
    const priced = await priceBooking(args, ctx)
    if (!priced.ok) return { data: priced.data }
    return { data: { priced: true, total: priced.total, lines: priced.lines } }
  },
})

/* --------------------------------------------------------------------------
   The visitor's own trip and orders
   -------------------------------------------------------------------------- */

const myTripTool = tool({
  name: 'my_trip',
  description: "The visitor's own My Trip (cart): items, dates, prices and total.",
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => {
    const trip = await ctx.deps.myTrip()
    if (!trip || trip.itemCount === 0) return { data: { empty: true, browse: '/activities' } }
    return {
      data: {
        empty: false,
        page: '/my-trip',
        checkout: '/checkout',
        readyToPay: trip.ok,
        total: money(trip.totalMinor, trip.currency),
        items: trip.lines.slice(0, 20).map((line) => ({
          name: line.name ? pick(line.name, ctx.locale) : line.kind,
          date: line.travelDate,
          time: line.travelTime?.slice(0, 5) ?? null,
          people: line.guests,
          price:
            line.lineTotalMinor !== null && line.currency !== null
              ? money(line.lineTotalMinor, line.currency)
              : null,
          ...(line.issue ? { problem: line.issue } : {}),
        })),
      },
    }
  },
})

const myOrdersTool = tool({
  name: 'my_orders',
  description: "The signed-in visitor's own orders and each booking's status. Requires sign-in.",
  parameters: obj({}),
  schema: z.object({}),
  run: async (_args, ctx) => {
    // Identity from the session only. There is no argument to ask for anyone else's.
    if (ctx.userId === null) return { data: { signedIn: false, signIn: '/account' } }
    const orders = await ctx.deps.myOrders(ctx.userId)
    return {
      data: {
        signedIn: true,
        page: '/account/invoices',
        orders: orders.slice(0, 10).map((order) => ({
          orderNumber: order.orderNumber,
          date: order.date,
          status: order.status,
          total: money(order.totalMinor, order.currency),
          items: order.items.slice(0, 12).map((item) => ({
            name: item.name ? pick(item.name, ctx.locale) : item.kind,
            bookingStatus: item.bookingStatus,
            date: item.travelDate,
          })),
        })),
      },
    }
  },
})

/* --------------------------------------------------------------------------
   Proposals (confirmed by a click)
   -------------------------------------------------------------------------- */

const proposeAddTool = tool({
  name: 'propose_add_to_trip',
  description:
    "Propose adding one activity booking to the visitor's My Trip. Shows a Confirm button; nothing is added until the visitor presses it. Validate with the same fields as quote_activity.",
  parameters: bookingParameters,
  schema: bookingSchema,
  run: async (args, ctx) => {
    const priced = await priceBooking(args, ctx)
    if (!priced.ok) return { data: priced.data }
    const L = ctx.locale
    const summary = {
      activity: pick(priced.activity.name, L, priced.activity.slug),
      package: priced.tier ? pick(priced.tier.name, L, priced.tier.key) : null,
      date: priced.draft.endDate
        ? `${priced.draft.date} → ${priced.draft.endDate}`
        : priced.draft.date,
      time: priced.draft.time,
      people: priced.draft.people,
      addons: priced.addonNames,
      driver: priced.draft.driver,
      total: priced.total,
      href: priced.activity.href,
    }
    const id = await ctx.deps.createAction({
      conversationId: ctx.conversationId,
      kind: 'add_to_trip',
      args: { ...priced.draft },
      summary,
    })
    return {
      data: {
        proposed: true,
        shownToVisitor: summary,
        note: 'Ask the visitor to press Confirm. Nothing is added yet.',
      },
      action: { id, kind: 'add_to_trip', summary },
    }
  },
})

/** Trip types the custom-trip form offers (custom/types.ts FORM_THEMES). */
export const CUSTOM_THEMES = ['family', 'honey', 'youth', 'solo'] as const

const customSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254)),
  phone: z.string().trim().max(32).optional(),
  startDate: DATE.optional(),
  endDate: DATE.optional(),
  travellers: z.number().int().min(1).max(20),
  theme: z.enum(CUSTOM_THEMES),
  budgetTier: z.enum(BUDGET_TIERS),
  interests: z.array(KEY).min(1).max(10),
  wantsDriver: z.boolean().optional(),
  hasChildren: z.boolean().optional(),
  areas: z.array(KEY).max(12).optional(),
  notes: z.string().trim().max(1500).optional(),
})

const proposeCustomTool = tool({
  name: 'propose_custom_request',
  description:
    'Propose sending a custom trip request to the Bali Trips team (they reply with a tailored plan). Shows a Confirm button; nothing is sent until the visitor presses it. interests and areas are category / region keys from list_regions_categories.',
  parameters: obj(
    {
      name: { type: 'string' },
      email: { type: 'string' },
      phone: { type: 'string' },
      startDate: { type: 'string', description: 'YYYY-MM-DD' },
      endDate: { type: 'string', description: 'YYYY-MM-DD' },
      travellers: { type: 'integer', minimum: 1, maximum: 20 },
      theme: { type: 'string', enum: [...CUSTOM_THEMES] },
      budgetTier: { type: 'string', enum: [...BUDGET_TIERS] },
      interests: { type: 'array', items: { type: 'string' } },
      wantsDriver: { type: 'boolean' },
      hasChildren: { type: 'boolean' },
      areas: { type: 'array', items: { type: 'string' } },
      notes: { type: 'string' },
    },
    ['name', 'email', 'travellers', 'theme', 'budgetTier', 'interests'],
  ),
  schema: customSchema,
  run: async (args, ctx) => {
    if ((args.startDate === undefined) !== (args.endDate === undefined)) {
      return {
        data: { error: 'invalid_arguments', detail: 'give both startDate and endDate, or neither' },
      }
    }
    const { regions, categories } = await ctx.deps.taxonomy()
    const categoryKeys = new Set(categories.map((c) => c.key))
    const regionKeys = new Set(regions.map((r) => r.key))
    const interests = args.interests.filter((key) => categoryKeys.has(key) && key !== 'all')
    if (interests.length === 0) {
      return {
        data: {
          error: 'invalid_arguments',
          detail: 'interests must be category keys from list_regions_categories',
        },
      }
    }
    const areas = (args.areas ?? []).filter((key) => regionKeys.has(key))
    const label = (keys: string[], list: { key: string; label: Record<string, string> }[]) =>
      keys.map((key) => pick(list.find((x) => x.key === key)?.label, ctx.locale, key))
    const cleanArgs = { ...args, interests, areas }
    const summary = {
      name: args.name,
      email: args.email,
      phone: args.phone ?? null,
      dates: args.startDate && args.endDate ? `${args.startDate} → ${args.endDate}` : null,
      travellers: args.travellers,
      theme: args.theme,
      budget: args.budgetTier,
      interests: label(interests, categories),
      areas: label(areas, regions),
      driver: FEATURES.driver && args.wantsDriver === true,
      notes: args.notes ?? null,
    }
    const id = await ctx.deps.createAction({
      conversationId: ctx.conversationId,
      kind: 'custom_request',
      args: cleanArgs,
      summary,
    })
    return {
      data: {
        proposed: true,
        shownToVisitor: summary,
        note: 'Ask the visitor to check the details and press Confirm.',
      },
      action: { id, kind: 'custom_request', summary },
    }
  },
})

export const PUBLIC_TOOLS: readonly Tool[] = [
  searchSite,
  listActivitiesTool,
  getActivityTool,
  packagesTool,
  itinerariesTool,
  taxonomyTool,
  searchPlacesTool,
  getPlaceTool,
  // Hidden while the driver service is switched off (lib/features.ts).
  ...(FEATURES.driver ? [driversTool] : []),
  siteInfoTool,
  quoteTool,
  myTripTool,
  myOrdersTool,
  proposeAddTool,
  proposeCustomTool,
]
