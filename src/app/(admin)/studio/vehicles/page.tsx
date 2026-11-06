import { can } from '@/lib/auth/roles'
import { FEATURES } from '@/lib/features'
import { readDriverSettings } from '@/lib/itineraries/sales-settings-store'

import { getAdminI18n } from '../../_lib/i18n'
import { requireAnyCapability } from '../../_lib/session'
import { Flash } from '../../_ui/flash'
import { Icon } from '../../_ui/icons'
import { PageHead } from '../../_ui/shell'
import { DriverRulesSection } from './driver-rules'
import { FleetSection } from './fleet'
import { PackageVehiclesSection } from './package-vehicles'

export const dynamic = 'force-dynamic'

/**
 * «السيارات والسائق» — the one screen for cars (Studio v2, Nov 2026).
 *
 * There used to be three editors: the driver fleet on Capacity, the same
 * fleet's notice/hours on Itineraries → Driver, and the package vehicles
 * setting on Packages → Vehicles. Their data stays where it was
 * (`driver_vehicles`, the driver settings, the `vehicles` setting) and so do
 * their prices and how they are used; only the editing moved here, each in
 * its own section, each still gated on its own capability. The old
 * addresses redirect.
 */
export default async function VehiclesAndDriverPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireAnyCapability(['capacity.write', 'content.write'])
  const { t } = await getAdminI18n()
  const params = await searchParams
  const fleet = can(session.role, 'capacity.write')
  const packages = can(session.role, 'content.write')
  const settings = fleet ? await readDriverSettings() : null

  const jumps = [
    ...(fleet
      ? [
          ['fleet', t('vd.sec_fleet')],
          ['rules', t('vd.sec_rules')],
          ['calendar', t('vd.sec_calendar')],
        ]
      : []),
    ...(packages ? [['packages', t('vd.sec_packages')]] : []),
  ]

  return (
    <>
      <PageHead title={t('vd.title')} description={t('vd.description')} />
      {FEATURES.driver ? null : (
        <div className="a-flash warn a-vd-banner" role="status">
          <Icon name="alert" size={20} />
          <span>
            <b>{t('vd.hidden_banner')}</b>
          </span>
        </div>
      )}
      <Flash searchParams={params} />
      <nav className="a-vd-jump" aria-label={t('vd.jump')}>
        {jumps.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      {fleet && settings ? (
        <FleetSection
          params={params}
          lockPrices={!can(session.role, 'prices.write')}
          defaultNotice={settings.noticeDays}
          rules={<DriverRulesSection params={params} />}
        />
      ) : (
        <p className="a-hint">{t('vd.no_capacity')}</p>
      )}

      {packages ? <PackageVehiclesSection /> : null}
    </>
  )
}
