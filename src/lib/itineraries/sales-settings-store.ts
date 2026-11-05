/** Database reads for `./sales-settings` (kept apart so the shapes stay pure). */

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'

import {
  DRIVER_SETTINGS_KEY,
  ITINERARY_SALES_KEY,
  parseDriverSettings,
  parseItinerarySales,
  type DriverSettings,
  type ItinerarySalesSettings,
} from './sales-settings'

async function readRow(key: string): Promise<unknown> {
  const [row] = await db
    .select({ value: siteSettings.value })
    .from(siteSettings)
    .where(eq(siteSettings.key, key))
    .limit(1)
  return row?.value
}

export async function readItinerarySales(): Promise<ItinerarySalesSettings> {
  return parseItinerarySales(await readRow(ITINERARY_SALES_KEY))
}

export async function readDriverSettings(): Promise<DriverSettings> {
  return parseDriverSettings(await readRow(DRIVER_SETTINGS_KEY))
}
