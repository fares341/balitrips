import Link from 'next/link'

import { can } from '@/lib/auth/roles'
import { REPORT_ICONS, REPORT_IDS, mayOpen } from '@/lib/reports/catalog'

import { adminHref } from '../../_lib/admin-path'
import { requireCapability } from '../../_lib/session'
import { Icon, type IconName } from '../../_ui/icons'
import { PageHead } from '../../_ui/shell'
import { buildContext, reportAccess } from './access'

import '../../_ui/reports/reports.css'

export const dynamic = 'force-dynamic'

/**
 * Report centre (التقارير). Each report: filters, comparison with the
 * previous period, charts and tables, CSV and PDF export, and a link from
 * every number to its records. Reports the role may not open are not listed
 * (and refuse on their own page too).
 */
export default async function ReportsPage() {
  const session = await requireCapability('orders.read')
  const { t } = await buildContext(session.role)
  const access = reportAccess(session.role)
  const visible = REPORT_IDS.filter((id) => mayOpen(id, access))

  return (
    <>
      <PageHead
        title={t('rp.hub_title')}
        description={t('rp.hub_description')}
        actions={
          <>
            <Link className="a-btn ghost" href={adminHref('/reports/exports')}>
              {t('rp.exports_title')}
            </Link>
            {can(session.role, 'config.write') ? (
              <Link className="a-btn ghost" href={adminHref('/reports/schedules')}>
                {t('rp.schedules_title')}
              </Link>
            ) : null}
          </>
        }
      />
      <nav className="rp-hub" aria-label={t('rp.hub_title')}>
        {visible.map((id) => (
          <Link key={id} href={adminHref(`/reports/${id}`)}>
            <span className="rp-hub-icon" aria-hidden="true">
              <Icon name={REPORT_ICONS[id] as IconName} size={22} />
            </span>
            <span>
              <b>{t(`rp.r_${id}`)}</b>
              <span className="rp-hub-desc">{t(`rp.r_${id}_d`)}</span>
            </span>
          </Link>
        ))}
        <Link href={adminHref('/map-analytics')}>
          <span className="rp-hub-icon" aria-hidden="true">
            <Icon name="map" size={22} />
          </span>
          <span>
            <b>{t('rp.map_title')}</b>
            <span className="rp-hub-desc">{t('rp.map_description')}</span>
          </span>
        </Link>
      </nav>
    </>
  )
}
