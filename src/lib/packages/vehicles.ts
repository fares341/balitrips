/**
 * Vehicles and driver-day prices (client, Oct 2026 — «السيارات وأسعار السائق»).
 *
 * Every package includes a driver. The driver costs one day price per day of
 * the package, and that price depends on the vehicle and on the zone the day
 * happens in (the client's price sheets: farther areas cost more). The data
 * lives in `site_settings` under `vehicles` and is edited in Studio →
 * Packages → Vehicles; this module is its shape, the shipped default (the
 * client's sheets, Oct 2026) and the pure price helpers.
 *
 * Prices are written as the client wrote them: SAR on every sheet, IDR and
 * USD where the sheet gives them. The site sells in USD, so a day price is
 * the sheet's USD when there is one, else SAR ÷ the Studio rate (default
 * 3.75), rounded to the cent.
 *
 * Capacity was NOT on the client's sheets. The defaults below are placeholders
 * (`capacityConfirmed: false`, shown as «للتأكيد» in the Studio) until the
 * owner confirms them.
 */

import { z } from 'zod'

import type { LocalizedText } from '@/lib/content/types'

export const VEHICLE_CLASSES = ['standard', 'van', 'luxury'] as const
export type VehicleKind = (typeof VEHICLE_CLASSES)[number]

const text = z.string().trim().max(400).default('')
const localized = z.object({ en: text, ar: text, id: text })

const price = z.number().min(0).max(100_000_000).nullable().default(null)

export const vehicleZoneSchema = z.object({
  zone: z.number().int().min(1).max(20),
  /** The areas the sheet lists for this zone (free text, used to match regions). */
  areas: z.string().trim().max(400).default(''),
  sar: price,
  idr: price,
  usd: price,
})

export const vehicleSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{2,32}$/),
  name: localized,
  vehicleClass: z.enum(VEHICLE_CLASSES).default('standard'),
  /** Travellers the vehicle seats. Not given by the client yet — see `capacityConfirmed`. */
  capacity: z.number().int().min(1).max(60).default(6),
  capacityConfirmed: z.boolean().default(false),
  note: localized.optional(),
  active: z.boolean().default(true),
  zones: z.array(vehicleZoneSchema).max(20).default([]),
  /** Studio overrides: region key → zone number for this vehicle. */
  regionZones: z.record(z.string(), z.number().int().min(1).max(20)).default({}),
})

export const vehiclesSchema = z.object({
  /** How many SAR make one USD. */
  sarPerUsd: z.number().min(0.5).max(20).default(3.75),
  vehicles: z.array(vehicleSchema).max(20).default([]),
})

export type VehicleZone = z.infer<typeof vehicleZoneSchema>
export type Vehicle = z.infer<typeof vehicleSchema>
export type VehiclesSetting = z.infer<typeof vehiclesSchema>

const empty = { en: '', ar: '', id: '' }

/** The client's driver price sheets (Oct 2026). Capacities are placeholders. */
export const VEHICLES_DEFAULT: VehiclesSetting = {
  sarPerUsd: 3.75,
  vehicles: [
    {
      key: 'standard',
      name: {
        ar: 'سيارة عادية — Avanza / Xenia',
        en: 'Standard car — Avanza / Xenia',
        id: 'Mobil standar — Avanza / Xenia',
      },
      vehicleClass: 'standard',
      capacity: 6,
      capacityConfirmed: false,
      note: { ar: 'موديل 2023 أو 2024 حسب التوفر', en: '2023 or 2024 model, as available', id: '' },
      active: true,
      zones: [
        {
          zone: 1,
          areas: 'Ubud Central, Nusa Dua, Seminyak, Canggu, Kuta, Denpasar',
          sar: 140,
          idr: 550000,
          usd: null,
        },
        {
          zone: 2,
          areas:
            'Payangan Ubud, Padma Ubud, Tegalalang, Bedugul – Beratan Lake, Padang Bai, Karangasem',
          sar: 155,
          idr: 620000,
          usd: null,
        },
        { zone: 3, areas: 'Kintamani', sar: 165, idr: 650000, usd: null },
        {
          zone: 4,
          areas: 'Buyan (twin lakes), Banyumala Waterfall, Batur Lake & Mount Batur',
          sar: 180,
          idr: 750000,
          usd: null,
        },
        {
          zone: 5,
          areas: 'Git Git Waterfall & Aling Aling Waterfall',
          sar: 195,
          idr: 800000,
          usd: null,
        },
      ],
      regionZones: {},
    },
    {
      key: 'hiace',
      name: {
        ar: 'السيارات الكبيرة — Toyota Hiace Commuter',
        en: 'Large van — Toyota Hiace Commuter',
        id: 'Van besar — Toyota Hiace Commuter',
      },
      vehicleClass: 'van',
      capacity: 14,
      capacityConfirmed: false,
      active: true,
      zones: [
        {
          zone: 1,
          areas: 'Ubud, Seminyak, Canggu, Kuta, Jimbaran, Uluwatu, Nusa Dua, Denpasar, Sanur',
          sar: 335,
          idr: 1300000,
          usd: 90,
        },
        {
          zone: 2,
          areas: 'Kintamani, Bedugul, East Ubud',
          sar: 360,
          idr: 1400000,
          usd: 95,
        },
        { zone: 3, areas: 'Jakarta', sar: 445, idr: 1750000, usd: 120 },
      ],
      regionZones: {},
    },
    {
      key: 'alphard-2020',
      name: {
        ar: 'السيارة الفاخرة — Toyota Alphard 2020–2022',
        en: 'Luxury — Toyota Alphard 2020–2022',
        id: 'Mewah — Toyota Alphard 2020–2022',
      },
      vehicleClass: 'luxury',
      capacity: 6,
      capacityConfirmed: false,
      active: true,
      zones: [
        {
          zone: 1,
          areas:
            'Ubud Central, Nusa Dua, Seminyak, Kuta, Denpasar, Payangan/Padma Ubud/Tegalalang, Bedugul – Beratan Lake, Padang Bai, Karangasem',
          sar: 700,
          idr: null,
          usd: null,
        },
        {
          zone: 2,
          areas: 'Git Git & Aling Aling waterfalls, Twin lake Buyan, Banyumala Waterfall',
          sar: 780,
          idr: null,
          usd: null,
        },
        { zone: 3, areas: 'Kintamani – Gunung Batur', sar: 750, idr: null, usd: null },
      ],
      regionZones: {},
    },
    {
      key: 'alphard-hybrid',
      name: {
        ar: 'Toyota Alphard Hybrid الجديدة',
        en: 'Toyota Alphard new Hybrid',
        id: 'Toyota Alphard Hybrid baru',
      },
      vehicleClass: 'luxury',
      capacity: 6,
      capacityConfirmed: false,
      note: {
        ar: 'مقاعد مساج قابلة للإمالة، تكييف قوي، مساحة أمتعة كبيرة، مناسبة للعائلات، سائق محترف',
        en: 'Massage and reclining seats, strong A/C, large luggage space, family-friendly, professional driver',
        id: '',
      },
      active: true,
      zones: [
        {
          zone: 1,
          areas:
            'Ubud Central, Nusa Dua, Seminyak, Kuta, Denpasar, Payangan/Padma Ubud/Tegalalang, Bedugul – Beratan Lake, Telaga Waja, Padang Bai, Karangasem',
          sar: 965,
          idr: null,
          usd: null,
        },
        {
          zone: 2,
          areas: 'Git Git & Aling Aling waterfalls, Twin lake Buyan & Banyumala waterfall',
          sar: 1090,
          idr: null,
          usd: null,
        },
        {
          zone: 3,
          areas: 'Kintamani, Batur Lake & Mount Batur',
          sar: 1040,
          idr: null,
          usd: null,
        },
      ],
      regionZones: {},
    },
  ],
}

export function emptyLocalized(): { en: string; ar: string; id: string } {
  return { ...empty }
}

export function isLuxury(vehicle: Pick<Vehicle, 'vehicleClass'>): boolean {
  return vehicle.vehicleClass === 'luxury'
}

/** A zone's day price in USD cents: the sheet's USD, else SAR ÷ rate. Null when neither. */
export function zoneUsdMinor(zone: VehicleZone, sarPerUsd: number): number | null {
  if (zone.usd !== null) return Math.round(zone.usd * 100)
  if (zone.sar !== null && sarPerUsd > 0) return Math.round((zone.sar / sarPerUsd) * 100)
  return null
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** A region as the zone lookup needs it: its key and its names. */
export interface ZoneRegion {
  key: string
  label: LocalizedText | Record<string, string> | null
}

/**
 * The zone a day in this region falls in, for this vehicle.
 *
 * 1. The Studio's choice for the region (`regionZones`), when set;
 * 2. else the first zone whose area list names the region (its key or its
 *    English / Indonesian name);
 * 3. else the vehicle's first zone (the base price).
 */
export function zoneFor(vehicle: Vehicle, region: ZoneRegion | null): VehicleZone | null {
  const zones = [...vehicle.zones].sort((a, b) => a.zone - b.zone)
  if (zones.length === 0) return null
  if (region !== null) {
    const chosen = vehicle.regionZones[region.key]
    if (chosen !== undefined) {
      const zone = zones.find((entry) => entry.zone === chosen)
      if (zone !== undefined) return zone
    }
    const label = (region.label ?? {}) as Record<string, string | undefined>
    const names = [region.key.replace(/-/g, ' '), label.en ?? '', label.id ?? '']
      .map(norm)
      .filter((name) => name.length >= 3)
    for (const zone of zones) {
      const areas = ` ${norm(zone.areas)} `
      if (names.some((name) => areas.includes(` ${name} `))) return zone
    }
  }
  return zones[0] ?? null
}

/** The vehicles a party of this size fits in (active ones only). */
export function vehiclesFor(setting: VehiclesSetting, travellers: number): Vehicle[] {
  return setting.vehicles.filter((vehicle) => vehicle.active && vehicle.capacity >= travellers)
}
