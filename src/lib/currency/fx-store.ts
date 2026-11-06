import 'server-only'

import { cache } from 'react'

import { readSettings } from '@/app/(admin)/_lib/settings'

import { DEFAULT_FX, resolveFx, type FxTable } from './fx'

/**
 * The one exchange-rate source, read from `site_settings`.
 *
 * Back-compat: until the currencies row stores a USD rate, the old
 * `vehicles.sarPerUsd` (Studio → Packages → Vehicles, before Nov 2026)
 * still decides it. Never throws: a database failure reads as the shipped
 * table, which is what the pages render with during a build without a DB.
 */
export const readFx = cache(async (): Promise<FxTable> => {
  try {
    const { values, missing } = await readSettings()
    const storedUsd = values.currencies.rates?.USD
    const legacy =
      storedUsd === undefined && !missing.includes('vehicles') ? values.vehicles.sarPerUsd : null
    return resolveFx(values.currencies, legacy)
  } catch {
    return DEFAULT_FX
  }
})

/** SAR per 1 USD, for the few call sites that still convert a USD amount. */
export async function readSarPerUsd(): Promise<number> {
  return (await readFx()).sarPerUsd
}
