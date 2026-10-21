'use server'

import { and, eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { driverCapacity, driverVehicles } from '@/db/schema'
import { assertPriceChangeAllowed } from '@/lib/auth/price-guard'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import {
  fcurrency,
  fint,
  flocalizedOrNull,
  flocalizedRequired,
  fcurrencyOr,
  fmoney,
  freq,
} from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/capacity')

type Outcome = { ok: string } | { err: string }

/**
 * Fleet definition.
 *
 * `fleetSize` is the number that makes overbooking possible, so it is the
 * one field on this page that has to be right. The reservation path compares
 * against it inside a single conditional UPDATE, which is why lowering it
 * below the current bookings is refused here rather than discovered on the
 * day of travel.
 */
export async function saveVehicle(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    const values = {
      vehicleClass: freq(form, 'vehicleClass', t('capacity.vehicle_class'))
        .toLowerCase()
        .slice(0, 16),
      label: flocalizedRequired(form, 'label', t('capacity.label')),
      description: flocalizedOrNull(form, 'description'),
      minPassengers: fint(form, 'minPassengers', 1, t('capacity.min_passengers')),
      maxPassengers: fint(form, 'maxPassengers', 4, t('capacity.max_passengers')),
      dayRateMinor: fmoney(
        form,
        'dayRateMinor',
        fcurrencyOr(form, 'currency'),
        t('capacity.day_rate'),
      ),
      currency: fcurrency(form, 'currency'),
      fleetSize: fint(form, 'fleetSize', 0, t('capacity.fleet_size')),
      sortOrder: fint(form, 'sortOrder', 0, t('common.order')),
    }

    if (values.minPassengers < 1) throw new Error(t('capacity.err_min_passengers'))
    if (values.maxPassengers < values.minPassengers) {
      throw new Error(t('capacity.err_max_below_min'))
    }
    if (values.fleetSize < 0) throw new Error(t('capacity.err_fleet_negative'))

    await db.transaction(async (tx) => {
      const before =
        id === 'new'
          ? null
          : ((
              await tx.select().from(driverVehicles).where(eq(driverVehicles.id, id)).limit(1)
            )[0] ?? null)

      if (id !== 'new' && !before) throw new Error(t('capacity.err_gone'))
      // Phase 6: without `prices.write` the price must come back as stored.
      assertPriceChangeAllowed(
        session.role,
        before,
        values,
        before ? ['dayRateMinor', 'currency'] : ['dayRateMinor'],
        t('team.err_prices'),
      )

      const [row] =
        id === 'new'
          ? await tx.insert(driverVehicles).values(values).returning()
          : await tx.update(driverVehicles).set(values).where(eq(driverVehicles.id, id)).returning()

      await writeAudit(
        {
          actor: session,
          action: id === 'new' ? 'driver_vehicle.create' : 'driver_vehicle.update',
          entityType: 'driver_vehicle',
          entityId: row?.id ?? null,
          before,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: t('capacity.ok_saved') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * Close or reopen a single date without touching fleet size.
 *
 * A blocked date is how an operator handles Nyepi, a maintenance day or a
 * driver's leave: the fleet still exists, it is simply not sellable that day.
 */
export async function setDayBlocked(
  vehicleClass: string,
  day: string,
  blocked: boolean,
  returnQuery: string,
): Promise<void> {
  const session = await requireCapability('capacity.write')
  const { t } = await getAdminI18n()
  let outcome: Outcome

  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(t('capacity.err_not_date', { day }))

    await db.transaction(async (tx) => {
      // Make sure the row exists before updating it — most dates have no
      // capacity row until the first booking creates one.
      await tx
        .insert(driverCapacity)
        .values({ vehicleClass, day, bookedCount: 0, isBlocked: blocked })
        .onConflictDoNothing({ target: [driverCapacity.vehicleClass, driverCapacity.day] })

      const [before] = await tx
        .select()
        .from(driverCapacity)
        .where(and(eq(driverCapacity.vehicleClass, vehicleClass), eq(driverCapacity.day, day)))
        .limit(1)

      const [after] = await tx
        .update(driverCapacity)
        .set({ isBlocked: blocked })
        .where(and(eq(driverCapacity.vehicleClass, vehicleClass), eq(driverCapacity.day, day)))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: blocked ? 'driver_capacity.block' : 'driver_capacity.unblock',
          entityType: 'driver_capacity',
          entityId: after?.id ?? before?.id ?? null,
          before: before ?? null,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = {
      ok: t(blocked ? 'capacity.ok_blocked' : 'capacity.ok_reopened', { day, class: vehicleClass }),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(`${LIST}${returnQuery}`, outcome))
}
