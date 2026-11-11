/**
 * Itinerary sales and driver settings (owner, Nov 2026 — corrected spec §5/§6).
 *
 * Two `site_settings` rows, each a zod shape with shipped defaults; a missing
 * or malformed row reads as the default, never as an error:
 *
 *  - `itinerarySales`: the two buy options on the itinerary page («الجدول
 *    فقط» / «الجدول + الخريطة»), the map-with-itinerary price, default prices
 *    per duration, the «كل الفعاليات» bundle discount and how often a buyer
 *    may use it, the «الأكثر طلبًا» badge, and the e-mail link / upload limits.
 *  - `driver`: the private-driver booking rules. The driver is NOT a public
 *    section (`FEATURES.driver` stays false); `showOnBuyerPage` only lets it
 *    appear on the buyer-only «فعاليات جدولي» page, and is off by default.
 *
 * New prices are entered in SAR (§0). Money is in minor units, never floats.
 * This module is pure; the database reads live in `./sales-settings-store`.
 */

import { z } from 'zod'

import { DEFAULT_CUSTOM_TRIP_TIERS } from './custom-tiers'

export const ITINERARY_SALES_KEY = 'itinerarySales'
export const DRIVER_SETTINGS_KEY = 'driver'

const text = (max = 200) => z.string().trim().max(max).default('')
const localized = (max = 200) =>
  z.object({ en: text(max), ar: text(max), id: text(max) }).default({ en: '', ar: '', id: '' })
const minor = z.number().int().min(0).max(100_000_000)

const optionSchema = z.object({
  enabled: z.boolean().default(true),
  label: localized(),
  /** Small badge on the option card («الأكثر اختيارًا»). '' = none. */
  badge: localized(),
})

export const itinerarySalesSchema = z.object({
  /** Prices on this screen are SAR — the base currency. Stored rows that say otherwise read as SAR. */
  currency: z
    .string()
    .optional()
    .transform((): 'SAR' => 'SAR'),
  options: z
    .object({
      itineraryOnly: optionSchema.default({
        enabled: true,
        label: { en: 'Itinerary only', ar: 'الجدول فقط', id: 'Hanya itinerary' },
        badge: { en: '', ar: '', id: '' },
      }),
      withMap: optionSchema.default({
        enabled: true,
        label: { en: 'Itinerary + map', ar: 'الجدول + الخريطة', id: 'Itinerary + peta' },
        badge: { en: 'Most chosen', ar: 'الأكثر اختيارًا', id: 'Paling dipilih' },
      }),
    })
    .default({
      itineraryOnly: {
        enabled: true,
        label: { en: 'Itinerary only', ar: 'الجدول فقط', id: 'Hanya itinerary' },
        badge: { en: '', ar: '', id: '' },
      },
      withMap: {
        enabled: true,
        label: { en: 'Itinerary + map', ar: 'الجدول + الخريطة', id: 'Itinerary + peta' },
        badge: { en: 'Most chosen', ar: 'الأكثر اختيارًا', id: 'Paling dipilih' },
      },
    }),
  /**
   * The map's price when bought with an itinerary. Its full price is the
   * existing map product's (`mapPlanId`, or the cheapest published map plan).
   */
  mapBundlePriceMinor: minor.default(0),
  /** The map product whose price is «the full price». '' = cheapest published. */
  mapPlanId: z.string().trim().max(64).default(''),
  /** Suggested price for a new itinerary of N days (Studio prefill only). */
  defaultPrices: z
    .array(z.object({ days: z.number().int().min(1).max(60), priceMinor: minor }))
    .max(30)
    .default([]),
  /**
   * Custom itinerary price tiers shown where the custom trip is offered
   * (`./custom-tiers`). Display only; SAR minor units.
   */
  customTripTiers: z
    .array(
      z.object({
        maxDays: z.number().int().min(1).max(90),
        priceMinor: minor.refine((v) => v > 0),
      }),
    )
    .max(6)
    .default(DEFAULT_CUSTOM_TRIP_TIERS.map((tier) => ({ ...tier }))),
  /** «احجز كل الفعاليات»: percent off the itinerary's linked activities. */
  allActivitiesDiscountPct: z.number().int().min(0).max(90).default(10),
  /** Whether the private driver counts toward the bundle discount. */
  discountIncludesDriver: z.boolean().default(false),
  /** How many times one bought itinerary may use the bundle discount. */
  usesPerPurchase: z.number().int().min(1).max(20).default(1),
  /** The «الأكثر طلبًا» badge text, shown on itineraries marked popular. */
  popularBadge: localized(60).default({
    en: 'Most requested',
    ar: 'الأكثر طلبًا',
    id: 'Paling diminati',
  }),
  /** E-mail download link: days valid and downloads allowed. */
  linkValidDays: z.number().int().min(1).max(90).default(7),
  linkMaxUses: z.number().int().min(1).max(50).default(5),
  /** Largest PDF Studio accepts, in MB (capped by the server-action body limit). */
  maxUploadMb: z.number().int().min(1).max(24).default(24),
})
export type ItinerarySalesSettings = z.infer<typeof itinerarySalesSchema>

export const VEHICLE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const driverSettingsSchema = z
  .object({
    /** «عرض السائق في صفحة فعاليات جدولي». Off by default. */
    showOnBuyerPage: z.boolean().default(false),
    noticeDays: z.number().int().min(0).max(30).default(4),
    /** After this time (Bali time) the notice counts from tomorrow. */
    cutoffTime: z.string().regex(VEHICLE_TIME).default('18:00'),
    maxAdvanceDays: z.number().int().min(1).max(730).default(180),
    timezone: z.string().trim().min(1).max(64).default('Asia/Makassar'),
    maxPax: z.number().int().min(1).max(60).default(12),
    minDays: z.number().int().min(1).max(60).default(1),
    /** null = the bought itinerary's number of days. */
    maxDays: z.number().int().min(1).max(60).nullable().default(null),
    blockedDates: z.array(z.string().regex(ISO_DATE)).max(400).default([]),
    includeInFullTripDiscount: z.boolean().default(false),
    cancellationPolicy: localized(2000),
  })
  .refine((s) => s.maxDays === null || s.maxDays >= s.minDays, {
    message: 'maxDays must be at least minDays',
    path: ['maxDays'],
  })
export type DriverSettings = z.infer<typeof driverSettingsSchema>

export const ITINERARY_SALES_DEFAULT: ItinerarySalesSettings = itinerarySalesSchema.parse({})
export const DRIVER_SETTINGS_DEFAULT: DriverSettings = driverSettingsSchema.parse({})

export function parseItinerarySales(raw: unknown): ItinerarySalesSettings {
  const parsed = itinerarySalesSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : ITINERARY_SALES_DEFAULT
}

export function parseDriverSettings(raw: unknown): DriverSettings {
  const parsed = driverSettingsSchema.safeParse(raw ?? {})
  return parsed.success ? parsed.data : DRIVER_SETTINGS_DEFAULT
}

/** The suggested price for an itinerary of `days`, or null when none is set. */
export function defaultPriceFor(settings: ItinerarySalesSettings, days: number): number | null {
  return settings.defaultPrices.find((row) => row.days === days)?.priceMinor ?? null
}
