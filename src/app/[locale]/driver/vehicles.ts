/**
 * Per-class presentation of the driver fleet: message keys and icons.
 *
 * Shared by the booking column (a client island) and the page's vehicle
 * options (server), so it lives outside the 'use client' module. Rates and
 * capacities are never here — they come from `driver_vehicles`.
 */

import type { IconName } from '@/components/ui'
import type { VehicleClass } from '@/lib/booking-rules'

/** Message key per vehicle class — the fallback when the row has no label. */
export const VEHICLE_LABEL: Record<VehicleClass, string> = {
  sedan: 'dp_veh_sedan',
  suv: 'dp_veh_suv',
  van: 'dp_veh_van',
}

export const VEHICLE_BLURB: Record<VehicleClass, string> = {
  sedan: 'dp_veh_sedan_b',
  suv: 'dp_veh_suv_b',
  van: 'dp_veh_van_b',
}

export const VEHICLE_ICON: Record<VehicleClass, IconName> = {
  sedan: 'car',
  suv: 'suv',
  van: 'van',
}
