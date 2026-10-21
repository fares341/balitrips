import { and, asc, eq, gte, lte } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { driverCapacity, driverVehicles } from '@/db/schema'
import { todayInBali } from '@/lib/booking-rules'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'
import { formatMoneyInput } from '@/lib/money-input'
import { localeConfig, locales } from '@/i18n/config'

import type { Translate } from '../../_i18n'
import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { param } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { PageHead } from '../../_ui/shell'
import { Empty, Table } from '../../_ui/table'
import { saveVehicle, setDayBlocked } from './actions'

export const dynamic = 'force-dynamic'

const LIST = adminHref('/capacity')
/** Monday-first short weekday names in the Studio language (2024-01-01 was a Monday). */
function weekdayNames(intl: string): string[] {
  const format = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 1 + index))),
  )
}

export default async function CapacityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('capacity.write')
  // Phase 6: the day rate is a cost — read-only without `prices.write`.
  const lockPrices = !can(session.role, 'prices.write')
  const { t, intl, locale: adminLocale } = await getAdminI18n()
  const params = await searchParams

  const vehicles = await db
    .select()
    .from(driverVehicles)
    .orderBy(asc(driverVehicles.sortOrder), asc(driverVehicles.vehicleClass))

  const requestedClass = param(params, 'class')
  const selectedClass =
    vehicles.find((vehicle) => vehicle.vehicleClass === requestedClass)?.vehicleClass ??
    vehicles[0]?.vehicleClass ??
    null

  // Month defaults to the current month in Bali, not the server's month —
  // every date this product shows is a calendar date on the island.
  const today = todayInBali()
  const requestedMonth = param(params, 'month')
  const month =
    requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : today.slice(0, 7)

  const [yearText, monthText] = month.split('-')
  const year = Number(yearText)
  const monthIndex = Number(monthText) - 1

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const firstDay = `${month}-01`
  const lastDay = `${month}-${String(daysInMonth).padStart(2, '0')}`

  const capacityRows = selectedClass
    ? await db
        .select()
        .from(driverCapacity)
        .where(
          and(
            eq(driverCapacity.vehicleClass, selectedClass),
            gte(driverCapacity.day, firstDay),
            lte(driverCapacity.day, lastDay),
          ),
        )
    : []

  const byDay = new Map(capacityRows.map((row) => [row.day, row]))
  const fleetSize = vehicles.find((v) => v.vehicleClass === selectedClass)?.fleetSize ?? 0

  // Monday-first: JS getUTCDay() is 0 for Sunday.
  const leadingBlanks = (new Date(Date.UTC(year, monthIndex, 1)).getUTCDay() + 6) % 7
  const returnQuery = `?class=${encodeURIComponent(selectedClass ?? '')}&month=${month}`

  const previousMonth = shiftMonth(year, monthIndex, -1)
  const nextMonth = shiftMonth(year, monthIndex, 1)

  return (
    <>
      <PageHead title={t('capacity.title')} description={t('capacity.description')} />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>{t('capacity.fleet')}</h2>
        {vehicles.length === 0 ? (
          <Empty>{t('capacity.empty_fleet')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('capacity.class')}</th>
                <th>{t('capacity.label')}</th>
                <th className="num">{t('capacity.passengers')}</th>
                <th className="num">{t('capacity.day_rate')}</th>
                <th className="num">{t('capacity.fleet_size')}</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id}>
                  <td className="a-mono">{vehicle.vehicleClass}</td>
                  <td>{pick(vehicle.label, adminLocale, vehicle.vehicleClass)}</td>
                  <td className="num">
                    {vehicle.minPassengers}–{vehicle.maxPassengers}
                  </td>
                  <td className="num">
                    {formatMoney(vehicle.dayRateMinor, vehicle.currency, intl)}
                  </td>
                  <td className="num">{vehicle.fleetSize}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
            marginBlockStart: 'var(--space-4)',
          }}
        >
          {vehicles.map((vehicle) => (
            <VehicleForm
              key={vehicle.id}
              id={vehicle.id}
              vehicle={vehicle}
              t={t}
              locked={lockPrices}
            />
          ))}
          <VehicleForm id="new" vehicle={null} t={t} locked={lockPrices} />
        </div>
      </div>

      <div className="a-card">
        <h2>{t('capacity.calendar')}</h2>

        <form className="a-row" method="get" action={LIST}>
          <div className="a-field">
            <label htmlFor="class">{t('capacity.vehicle_class')}</label>
            <select className="a-select" id="class" name="class" defaultValue={selectedClass ?? ''}>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.vehicleClass}>
                  {vehicle.vehicleClass}
                </option>
              ))}
            </select>
          </div>
          <div className="a-field">
            <label htmlFor="month">{t('capacity.month')}</label>
            <input className="a-input" id="month" name="month" type="month" defaultValue={month} />
          </div>
          <div className="a-actions">
            <button className="a-btn" type="submit">
              {t('capacity.show')}
            </button>
            <Link
              className="a-btn ghost"
              href={`${LIST}?class=${selectedClass ?? ''}&month=${previousMonth}`}
            >
              {t('common.previous')}
            </Link>
            <Link
              className="a-btn ghost"
              href={`${LIST}?class=${selectedClass ?? ''}&month=${nextMonth}`}
            >
              {t('common.next')}
            </Link>
          </div>
        </form>

        {!selectedClass ? (
          <Empty>{t('capacity.define_first')}</Empty>
        ) : (
          <>
            <p className="a-hint" style={{ marginBlock: 'var(--space-3)' }}>
              {t('capacity.fleet_hint', { class: selectedClass, count: fleetSize })}
            </p>
            <div className="a-cal">
              {weekdayNames(intl).map((weekday) => (
                <div className="a-cal-head" key={weekday}>
                  {weekday}
                </div>
              ))}
              {Array.from({ length: leadingBlanks }, (_, index) => (
                <div className="a-cal-cell pad" key={`pad-${index}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, index) => {
                const dayNumber = index + 1
                const day = `${month}-${String(dayNumber).padStart(2, '0')}`
                const row = byDay.get(day)
                const booked = row?.bookedCount ?? 0
                const blocked = row?.isBlocked ?? false
                const available = blocked ? 0 : fleetSize - booked

                return (
                  <div
                    className={`a-cal-cell ${blocked ? 'blocked' : available <= 0 ? 'full' : ''}`.trim()}
                    key={day}
                  >
                    <span className="a-cal-day">{dayNumber}</span>
                    <span className="a-muted">
                      {t('capacity.booked', { booked, fleet: fleetSize })}
                    </span>
                    <form
                      className="a-inline-form"
                      action={setDayBlocked.bind(null, selectedClass, day, !blocked, returnQuery)}
                    >
                      <button className="a-btn ghost small" type="submit">
                        {blocked ? t('capacity.reopen') : t('capacity.block')}
                      </button>
                    </form>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function shiftMonth(year: number, monthIndex: number, delta: number): string {
  const shifted = new Date(Date.UTC(year, monthIndex + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function VehicleForm({
  id,
  vehicle,
  t,
  locked,
}: {
  id: string
  vehicle: typeof driverVehicles.$inferSelect | null
  t: Translate
  locked: boolean
}) {
  const lockedClass = locked ? 'a-input a-locked' : 'a-input'
  return (
    <form className="a-day" action={saveVehicle.bind(null, id)}>
      <div className="a-day-no">{vehicle ? vehicle.vehicleClass : t('capacity.add_class')}</div>
      <div className="a-row">
        <div className="a-field">
          <label htmlFor={`vclass-${id}`}>{t('capacity.class')}</label>
          <input
            className="a-input"
            id={`vclass-${id}`}
            name="vehicleClass"
            defaultValue={vehicle?.vehicleClass ?? ''}
            required
            maxLength={16}
          />
        </div>
        <div className="a-field">
          <label htmlFor={`min-${id}`}>{t('capacity.min_passengers')}</label>
          <input
            className="a-input"
            id={`min-${id}`}
            name="minPassengers"
            inputMode="numeric"
            defaultValue={String(vehicle?.minPassengers ?? 1)}
          />
        </div>
        <div className="a-field">
          <label htmlFor={`max-${id}`}>{t('capacity.max_passengers')}</label>
          <input
            className="a-input"
            id={`max-${id}`}
            name="maxPassengers"
            inputMode="numeric"
            defaultValue={String(vehicle?.maxPassengers ?? 4)}
          />
        </div>
        <div className="a-field">
          <label htmlFor={`rate-${id}`}>{t('capacity.day_rate')}</label>
          <input
            className={lockedClass}
            readOnly={locked}
            id={`rate-${id}`}
            name="dayRateMinor"
            inputMode="decimal"
            dir="ltr"
            defaultValue={formatMoneyInput(vehicle?.dayRateMinor ?? 0, vehicle?.currency ?? 'USD')}
          />
          {locked ? <span className="a-hint">{t('team.prices_locked')}</span> : null}
        </div>
        <div className="a-field">
          <label htmlFor={`cur-${id}`}>{t('common.currency')}</label>
          <input
            className={lockedClass}
            readOnly={locked}
            id={`cur-${id}`}
            name="currency"
            maxLength={3}
            defaultValue={vehicle?.currency ?? 'USD'}
          />
        </div>
        <div className="a-field">
          <label htmlFor={`fleet-${id}`}>{t('capacity.fleet_size')}</label>
          <input
            className="a-input"
            id={`fleet-${id}`}
            name="fleetSize"
            inputMode="numeric"
            defaultValue={String(vehicle?.fleetSize ?? 0)}
          />
        </div>
        <div className="a-field">
          <label htmlFor={`vsort-${id}`}>{t('common.order')}</label>
          <input
            className="a-input"
            id={`vsort-${id}`}
            name="sortOrder"
            inputMode="numeric"
            defaultValue={String(vehicle?.sortOrder ?? 0)}
          />
        </div>
      </div>

      <fieldset className="a-fieldset">
        <legend>{t('capacity.label')}</legend>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={locale}>
              <label htmlFor={`vlabel-${id}-${locale}`}>{localeConfig[locale].label}</label>
              <input
                className="a-input"
                id={`vlabel-${id}-${locale}`}
                name={`label_${locale}`}
                defaultValue={vehicle?.label?.[locale] ?? ''}
                lang={locale}
                dir={localeConfig[locale].dir}
                required={locale === 'en'}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <fieldset className="a-fieldset">
        <legend>{t('common.description')}</legend>
        <div className="a-l10n">
          {locales.map((locale) => (
            <div className="a-field" key={locale}>
              <label htmlFor={`vdesc-${id}-${locale}`}>{localeConfig[locale].label}</label>
              <textarea
                className="a-textarea"
                id={`vdesc-${id}-${locale}`}
                name={`description_${locale}`}
                rows={2}
                defaultValue={vehicle?.description?.[locale] ?? ''}
                lang={locale}
                dir={localeConfig[locale].dir}
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="a-actions">
        <button className="a-btn ghost small" type="submit">
          {vehicle ? t('capacity.save_vehicle') : t('capacity.create_vehicle')}
        </button>
      </div>
    </form>
  )
}
