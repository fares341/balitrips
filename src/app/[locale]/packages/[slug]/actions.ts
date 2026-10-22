'use server'

/**
 * Package request (client, Oct 2026).
 *
 * A package is not bought instantly for now: the customer sends the package,
 * the start date, the travellers and the vehicle; it reaches staff (Studio →
 * Leads, the inbox and a notification), who check it with the suppliers and
 * then quote it — the customer pays that quote through the existing custom
 * request payment (Account → My schedules → Pay). The estimate is recomputed
 * here from the catalogue and the Studio vehicle prices; the browser never
 * names a price.
 */

import { and, gt, sql } from 'drizzle-orm'

import { db } from '@/db'
import { customTripRequests } from '@/db/schema'
import { defaultLocale, isLocale } from '@/i18n/config'
import { readSetting } from '@/app/(admin)/_lib/settings'
import { isPastInBali } from '@/lib/booking-rules'
import { pick } from '@/lib/content/localize'
import { getPackageBySlug } from '@/lib/content/queries'
import { formatMoney } from '@/lib/money'
import { notifyStaff, notifyUser } from '@/lib/notify'
import { estimatePackage, packageDayPlan } from '@/lib/packages/estimate'

import { currentUserId } from '../../_viewer/session'

export interface PackageRequestInput {
  slug: string
  startDate: string
  travellers: number
  vehicleKey: string
  name: string
  email: string
  phone: string
  notes: string
  locale: string
}

export type PackageRequestResult =
  | { ok: true; requestId: string }
  | { ok: false; reason: 'invalid' | 'not_found' | 'vehicle' | 'rate' | 'server' }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE = /^\+?[0-9][0-9\s\-()]{6,20}$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export async function requestPackageAction(
  input: PackageRequestInput,
): Promise<PackageRequestResult> {
  const name = String(input.name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  const email = String(input.email ?? '')
    .trim()
    .toLowerCase()
  const phone = String(input.phone ?? '').trim()
  const notes = String(input.notes ?? '')
    .trim()
    .slice(0, 1000)
  const travellers = Math.trunc(Number(input.travellers))
  const locale = isLocale(input.locale) ? input.locale : defaultLocale

  if (
    name.length < 2 ||
    name.length > 120 ||
    !EMAIL.test(email) ||
    !PHONE.test(phone) ||
    !DATE.test(String(input.startDate)) ||
    isPastInBali(input.startDate) ||
    !Number.isFinite(travellers) ||
    travellers < 1 ||
    travellers > 60
  ) {
    return { ok: false, reason: 'invalid' }
  }

  try {
    const pkg = await getPackageBySlug(String(input.slug))
    if (!pkg) return { ok: false, reason: 'not_found' }
    if (travellers > pkg.maxGuests) return { ok: false, reason: 'invalid' }

    const setting = await readSetting('vehicles')
    const vehicle = setting.vehicles.find((v) => v.key === input.vehicleKey && v.active)
    if (!vehicle || vehicle.capacity < travellers) return { ok: false, reason: 'vehicle' }

    // A public form: at most 5 package requests per address per hour.
    const [recent] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(customTripRequests)
      .where(
        and(
          sql`lower(${customTripRequests.email}) = ${email}`,
          gt(customTripRequests.createdAt, new Date(Date.now() - 60 * 60_000)),
        ),
      )
    if ((recent?.n ?? 0) >= 5) return { ok: false, reason: 'rate' }

    const estimate = estimatePackage({
      days: packageDayPlan({
        days: pkg.days,
        activities: pkg.activities,
        activityDays: pkg.activityDays,
        fallbackRegion: pkg.regions[0] ?? null,
      }),
      travellers,
      vehicle,
      sarPerUsd: setting.sarPerUsd,
    })

    const userId = await currentUserId()
    const packageName = pick(pkg.name, 'en', pkg.slug)
    const vehicleName = pick(vehicle.name, 'en', vehicle.key)
    const [row] = await db
      .insert(customTripRequests)
      .values({
        userId,
        name,
        email,
        phone,
        startDate: input.startDate,
        endDate: addDays(input.startDate, Math.max(1, pkg.days) - 1),
        days: Math.max(1, pkg.days),
        travellers,
        theme: 'package',
        currency: estimate.currency,
        wantsDriver: true,
        packageId: pkg.id,
        vehicleKey: vehicle.key,
        estimateMinor: estimate.totalMinor,
        estimateCurrency: estimate.currency,
        notes: [
          `Package: ${packageName}`,
          `Vehicle: ${vehicleName}`,
          `Estimate: ${formatMoney(estimate.totalMinor, estimate.currency, 'en')}${
            estimate.incomplete ? ' (incomplete)' : ''
          }`,
          `Locale: ${locale}`,
          ...(notes === '' ? [] : ['', notes]),
        ].join('\n'),
      })
      .returning({ id: customTripRequests.id })
    if (!row) return { ok: false, reason: 'server' }

    await notifyStaff(
      'staff_package_request',
      {
        name,
        package: packageName,
        travellers,
        total: formatMoney(estimate.totalMinor, estimate.currency, 'en'),
      },
      `/leads/${row.id}`,
    )
    if (userId !== null) {
      await notifyUser(userId, 'custom_received', { name }, '/account/schedules')
    }
    return { ok: true, requestId: row.id }
  } catch (error) {
    console.error('[packages] request failed', error)
    return { ok: false, reason: 'server' }
  }
}
