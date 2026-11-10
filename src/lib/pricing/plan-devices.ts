/**
 * Plans sold per device (owner, Nov 2026). Pure, shared by the server quote,
 * the grant and the public stepper — the server is the source of truth.
 *
 * The base price covers the plan's `deviceLimit` devices; each extra device
 * the buyer picks adds `extraDevicePriceMinor`, up to `maxDevices`.
 * Extra price NULL/0 = extra devices are not sold: the count is always the
 * plan's own `deviceLimit`.
 */

import { MAX_DEVICE_LIMIT } from '@/lib/security/config'

/** The buyer's cap when the plan sets none. */
export const DEFAULT_MAX_DEVICES = 5

export interface PlanDeviceFacts {
  priceMinor: number
  deviceLimit: number
  extraDevicePriceMinor?: number | null
  maxDevices?: number | null
}

export function sellsExtraDevices(plan: PlanDeviceFacts): boolean {
  const extra = plan.extraDevicePriceMinor
  return typeof extra === 'number' && Number.isSafeInteger(extra) && extra > 0
}

/** The device counts a buyer may choose: [deviceLimit, max]. */
export function planDeviceRange(plan: PlanDeviceFacts): { min: number; max: number } {
  const min = Math.max(1, Math.min(plan.deviceLimit, MAX_DEVICE_LIMIT))
  if (!sellsExtraDevices(plan)) return { min, max: min }
  const cap = plan.maxDevices ?? DEFAULT_MAX_DEVICES
  return { min, max: Math.max(min, Math.min(cap, MAX_DEVICE_LIMIT)) }
}

/** Any client value → a whole count inside the plan's range. */
export function clampPlanDevices(plan: PlanDeviceFacts, requested: unknown): number {
  const { min, max } = planDeviceRange(plan)
  const n =
    typeof requested === 'number'
      ? requested
      : typeof requested === 'string' && requested.trim() !== ''
        ? Number(requested)
        : NaN
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, Math.floor(n)))
}

/** What the extra devices add for `devices` (already clamped). */
export function planExtraDevicesMinor(plan: PlanDeviceFacts, devices: number): number {
  if (!sellsExtraDevices(plan)) return 0
  const extras = Math.max(0, devices - planDeviceRange(plan).min)
  return extras * (plan.extraDevicePriceMinor as number)
}

/** Base + extras for the clamped count. */
export function planTotalMinor(
  plan: PlanDeviceFacts,
  requested: unknown,
): {
  devices: number
  totalMinor: number
  extraMinor: number
} {
  const devices = clampPlanDevices(plan, requested)
  const extraMinor = planExtraDevicesMinor(plan, devices)
  return { devices, extraMinor, totalMinor: plan.priceMinor + extraMinor }
}

/**
 * Studio → Plans checks for the per-device fields (pure). `null` = valid;
 * otherwise which rule broke. Extra price must not be negative; the buyer's
 * cap (when set) runs from the included devices up to the ceiling.
 */
export function planDeviceSettingsError(input: {
  deviceLimit: number
  extraDevicePriceMinor: number | null
  maxDevices: number | null
}): 'extra_price' | 'max_devices' | null {
  const { deviceLimit, extraDevicePriceMinor: extra, maxDevices } = input
  if (extra !== null && (!Number.isSafeInteger(extra) || extra < 0)) return 'extra_price'
  if (
    maxDevices !== null &&
    (!Number.isInteger(maxDevices) || maxDevices < deviceLimit || maxDevices > MAX_DEVICE_LIMIT)
  ) {
    return 'max_devices'
  }
  return null
}
