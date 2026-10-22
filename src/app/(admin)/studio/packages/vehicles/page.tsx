import { asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { regions } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import {
  VEHICLE_CLASSES,
  emptyLocalized,
  isLuxury,
  zoneFor,
  zoneUsdMinor,
  type Vehicle,
} from '@/lib/packages/vehicles'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { readSetting } from '../../../_lib/settings'
import { Checkbox, Field, LocalizedField } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Pill, Table } from '../../../_ui/table'
import { saveVehicles } from './actions'

export const dynamic = 'force-dynamic'

const ZONE_ROWS = 6

/**
 * «السيارات وأسعار السائق» (client, Oct 2026). Every package includes a
 * driver; a package day costs the chosen vehicle's day price for the zone the
 * day happens in. Prices as on the client's sheets (SAR, IDR, USD); the site
 * sells in USD, so SAR is converted at the rate set here when no USD is given.
 */
export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams
  const [setting, areaRows] = await Promise.all([
    readSetting('vehicles'),
    db
      .select({ key: regions.key, label: regions.label })
      .from(regions)
      .where(eq(regions.status, 'active'))
      .orderBy(asc(regions.sortOrder), asc(regions.key)),
  ])

  const blank: Vehicle = {
    key: '',
    name: emptyLocalized(),
    vehicleClass: 'standard',
    capacity: 6,
    capacityConfirmed: false,
    note: emptyLocalized(),
    active: true,
    zones: [],
    regionZones: {},
  }
  const rows = [...setting.vehicles, blank]

  return (
    <>
      <PageHead title={t('veh.title')} description={t('veh.description')} />
      <Flash searchParams={params} />
      <form className="a-form" action={saveVehicles}>
        <input type="hidden" name="count" value={rows.length} />
        <div className="a-card">
          <h2>{t('veh.rate')}</h2>
          <Field label={t('veh.sar_per_usd')} htmlFor="sarPerUsd" hint={t('veh.sar_hint')}>
            <input
              className="a-input"
              id="sarPerUsd"
              name="sarPerUsd"
              inputMode="decimal"
              defaultValue={String(setting.sarPerUsd)}
            />
          </Field>
        </div>

        {rows.map((vehicle, i) => {
          const isNew = vehicle.key === ''
          const zoneSlots = [
            ...vehicle.zones,
            ...Array.from({ length: Math.max(0, ZONE_ROWS - vehicle.zones.length) }, () => null),
          ]
          return (
            <div className="a-card" key={vehicle.key || 'new'}>
              <h2>
                {isNew ? t('veh.add') : pick(vehicle.name, locale, vehicle.key)}{' '}
                {isLuxury(vehicle) && <Pill tone="warn">★ {t('veh.luxury')}</Pill>}
              </h2>
              <div className="a-row">
                <Field label={t('veh.key')} htmlFor={`v${i}.key`} hint={t('veh.key_hint')}>
                  <input
                    className="a-input"
                    id={`v${i}.key`}
                    name={`v${i}.key`}
                    defaultValue={vehicle.key}
                    pattern="[a-z0-9-]{2,32}"
                  />
                </Field>
                <Field label={t('veh.class')} htmlFor={`v${i}.class`}>
                  <select
                    className="a-select"
                    id={`v${i}.class`}
                    name={`v${i}.class`}
                    defaultValue={vehicle.vehicleClass}
                  >
                    {VEHICLE_CLASSES.map((kind) => (
                      <option key={kind} value={kind}>
                        {t(`veh.class_${kind}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label={t('veh.capacity')}
                  htmlFor={`v${i}.capacity`}
                  hint={vehicle.capacityConfirmed ? undefined : t('veh.to_confirm')}
                >
                  <input
                    className="a-input"
                    id={`v${i}.capacity`}
                    name={`v${i}.capacity`}
                    inputMode="numeric"
                    defaultValue={String(vehicle.capacity)}
                  />
                </Field>
              </div>
              <div className="a-row">
                <Checkbox
                  name={`v${i}.capacityConfirmed`}
                  label={t('veh.capacity_confirmed')}
                  defaultChecked={vehicle.capacityConfirmed}
                />
                <Checkbox
                  name={`v${i}.active`}
                  label={t('veh.active')}
                  defaultChecked={vehicle.active}
                />
                {!isNew && <Checkbox name={`v${i}.remove`} label={t('veh.remove')} />}
              </div>
              <LocalizedField name={`v${i}.name`} label={t('veh.name')} value={vehicle.name} />
              <LocalizedField
                name={`v${i}.note`}
                label={t('veh.note')}
                value={vehicle.note ?? emptyLocalized()}
              />

              <h3>{t('veh.zones')}</h3>
              <Table>
                <thead>
                  <tr>
                    <th>{t('veh.zone')}</th>
                    <th>{t('veh.areas')}</th>
                    <th>SAR</th>
                    <th>IDR</th>
                    <th>USD</th>
                    <th>{t('veh.site_price')}</th>
                  </tr>
                </thead>
                <tbody>
                  {zoneSlots.map((zone, j) => {
                    const usd = zone === null ? null : zoneUsdMinor(zone, setting.sarPerUsd)
                    const cell = (field: 'sar' | 'idr' | 'usd') => (
                      <input
                        className="a-input"
                        name={`v${i}.z${j}.${field}`}
                        inputMode="decimal"
                        aria-label={`${t('veh.zone')} ${j + 1} ${field.toUpperCase()}`}
                        defaultValue={
                          zone === null || zone[field] === null ? '' : String(zone[field])
                        }
                        style={{ width: 100 }}
                      />
                    )
                    return (
                      <tr key={j}>
                        <td>
                          <input
                            className="a-input"
                            name={`v${i}.z${j}.zone`}
                            inputMode="numeric"
                            aria-label={t('veh.zone')}
                            defaultValue={zone === null ? '' : String(zone.zone)}
                            style={{ width: 60 }}
                          />
                        </td>
                        <td>
                          <input
                            className="a-input"
                            name={`v${i}.z${j}.areas`}
                            aria-label={t('veh.areas')}
                            defaultValue={zone?.areas ?? ''}
                          />
                        </td>
                        <td>{cell('sar')}</td>
                        <td>{cell('idr')}</td>
                        <td>{cell('usd')}</td>
                        <td>{usd === null ? '—' : formatMoney(usd, 'USD', intl)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>

              {!isNew && vehicle.zones.length > 0 && (
                <>
                  <h3>{t('veh.region_zones')}</h3>
                  <p className="a-hint">{t('veh.region_zones_hint')}</p>
                  <div className="a-row" style={{ flexWrap: 'wrap' }}>
                    {areaRows.map((area) => {
                      const auto = zoneFor({ ...vehicle, regionZones: {} }, area)
                      return (
                        <Field
                          key={area.key}
                          label={pick(area.label, locale, area.key)}
                          htmlFor={`v${i}.r.${area.key}`}
                        >
                          <select
                            className="a-select"
                            id={`v${i}.r.${area.key}`}
                            name={`v${i}.r.${area.key}`}
                            defaultValue={
                              vehicle.regionZones[area.key] === undefined
                                ? ''
                                : String(vehicle.regionZones[area.key])
                            }
                          >
                            <option value="">{t('veh.auto', { zone: auto?.zone ?? 1 })}</option>
                            {vehicle.zones.map((zone) => (
                              <option key={zone.zone} value={zone.zone}>
                                {t('veh.zone')} {zone.zone}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )
        })}

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('veh.save')}
          </button>
          <a className="a-btn ghost" href={adminHref('/packages')}>
            {t('veh.back')}
          </a>
        </div>
      </form>
    </>
  )
}
