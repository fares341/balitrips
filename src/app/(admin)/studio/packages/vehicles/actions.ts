'use server'

import { eq, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'
import { VEHICLE_CLASSES, type Vehicle, type VehicleKind } from '@/lib/packages/vehicles'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { fbool, flocalized, fstr } from '../../../_lib/form'
import { getAdminI18n } from '../../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { parseSetting, SETTING_DEFAULTS } from '../../../_lib/settings'

const BACK = adminHref('/packages/vehicles')

function num(form: FormData, name: string): number | null {
  const value = (fstr(form, name) ?? '').replace(/[,\s]/g, '')
  if (value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Save «السيارات وأسعار السائق». The form posts every vehicle as `v{i}.*`,
 * its zones as `v{i}.z{j}.*` and its region choices as `v{i}.r.{regionKey}`;
 * a vehicle row with an empty key is ignored (the blank "add" row), and a
 * zone row with no number is dropped.
 */
export async function saveVehicles(form: FormData): Promise<void> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    const count = Number(fstr(form, 'count') ?? '0')
    const vehicles: Vehicle[] = []
    for (let i = 0; i < Math.min(count, 20); i += 1) {
      const key = (fstr(form, `v${i}.key`) ?? '').toLowerCase()
      if (key === '' || fbool(form, `v${i}.remove`)) continue
      const zones: Vehicle['zones'] = []
      for (let j = 0; j < 12; j += 1) {
        const zone = num(form, `v${i}.z${j}.zone`)
        if (zone === null) continue
        zones.push({
          zone,
          areas: fstr(form, `v${i}.z${j}.areas`) ?? '',
          sar: num(form, `v${i}.z${j}.sar`),
          idr: num(form, `v${i}.z${j}.idr`),
          usd: num(form, `v${i}.z${j}.usd`),
        })
      }
      const regionZones: Record<string, number> = {}
      for (const [name, value] of form.entries()) {
        const prefix = `v${i}.r.`
        if (!name.startsWith(prefix) || typeof value !== 'string' || value === '') continue
        regionZones[name.slice(prefix.length)] = Number(value)
      }
      const vehicleClass = fstr(form, `v${i}.class`) ?? 'standard'
      vehicles.push({
        key,
        name: flocalized(form, `v${i}.name`),
        vehicleClass: (VEHICLE_CLASSES as readonly string[]).includes(vehicleClass)
          ? (vehicleClass as VehicleKind)
          : 'standard',
        capacity: num(form, `v${i}.capacity`) ?? 6,
        capacityConfirmed: fbool(form, `v${i}.capacityConfirmed`),
        note: flocalized(form, `v${i}.note`),
        active: fbool(form, `v${i}.active`),
        zones,
        regionZones,
      })
    }
    const value = parseSetting('vehicles', { sarPerUsd: num(form, 'sarPerUsd') ?? 3.75, vehicles })

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ value: siteSettings.value })
        .from(siteSettings)
        .where(eq(siteSettings.key, 'vehicles'))
        .limit(1)
      await tx
        .insert(siteSettings)
        .values({ key: 'vehicles', value, updatedByActorId: session.userId })
        .onConflictDoUpdate({
          target: siteSettings.key,
          set: { value, updatedByActorId: session.userId, updatedAt: sql`now()` },
        })
      await writeAudit(
        {
          actor: session,
          action: 'config.update',
          entityType: 'setting',
          entityId: null,
          before: { vehicles: existing?.value ?? SETTING_DEFAULTS.vehicles },
          after: { vehicles: value },
        },
        tx,
      )
    })
    revalidatePath('/[locale]/packages/[slug]', 'page')
    outcome = { ok: t('veh.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  redirect(withOutcome(BACK, outcome))
}
