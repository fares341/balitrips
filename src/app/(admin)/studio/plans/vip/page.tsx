import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { plans } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import { readSetting } from '../../../_lib/settings'
import { Checkbox, Field, LocalizedField } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { Empty, PublishPill, Table } from '../../../_ui/table'
import { saveVipSettings } from '../../config/actions'

export const dynamic = 'force-dynamic'

/**
 * VIP map access settings (phase 3).
 *
 * The map has two levels, Free and VIP. VIP is only ever given by something
 * the customer paid for (a VIP plan on its own or as an extra, an itinerary
 * or package that says it includes VIP) or by staff by hand — this page
 * decides where it is OFFERED, and lists the plans that define it.
 */
export default async function VipSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('vip.manage')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams

  const [settings, vipPlans] = await Promise.all([
    readSetting('vip'),
    db
      .select()
      .from(plans)
      .where(and(eq(plans.entitlementKind, 'vip'), isNull(plans.deletedAt)))
      .orderBy(asc(plans.priceMinor)),
  ])

  return (
    <>
      <PageHead
        title={t('p3.vip_settings')}
        description={t('p3.vip_settings_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/plans')}>
            {t('p3.back_to_plans')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>{t('p3.vip_rules_title')}</h2>
        <ul className="a-hint">
          <li>{t('p3.vip_rule_1')}</li>
          <li>{t('p3.vip_rule_2')}</li>
          <li>{t('p3.vip_rule_3')}</li>
          <li>{t('p3.vip_rule_4')}</li>
        </ul>
      </div>

      <form className="a-form" action={saveVipSettings}>
        <div className="a-card">
          <h2>{t('p3.vip_where')}</h2>
          <div className="a-row">
            <Checkbox
              name="sellStandalone"
              label={t('p3.vip_standalone')}
              defaultChecked={settings.sellStandalone}
              hint={t('p3.vip_standalone_hint')}
            />
            <Checkbox
              name="checkoutUpsell"
              label={t('p3.vip_upsell')}
              defaultChecked={settings.checkoutUpsell}
              hint={t('p3.vip_upsell_hint')}
            />
          </div>
          <Field label={t('p3.vip_upsell_plan')} htmlFor="upsellPlanId">
            <select
              className="a-select"
              id="upsellPlanId"
              name="upsellPlanId"
              defaultValue={settings.upsellPlanId}
            >
              <option value="">{t('p3.vip_plan_auto')}</option>
              {vipPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {pick(plan.name, locale, plan.slug)}
                </option>
              ))}
            </select>
          </Field>
          <LocalizedField
            name="refundNote"
            label={t('p3.vip_refund_note')}
            value={settings.refundNote}
            rows={2}
          />
          <p className="a-hint">{t('p3.vip_refund_note_hint')}</p>
        </div>
        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('p3.vip_save')}
          </button>
        </div>
      </form>

      <div className="a-card">
        <h2>{t('p3.vip_plans')}</h2>
        <p className="a-hint">{t('p3.vip_plans_hint')}</p>
        {vipPlans.length === 0 ? (
          <Empty>{t('p3.no_vip_plans')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('plans.col_plan')}</th>
                <th>{t('common.price')}</th>
                <th>{t('plans.col_duration')}</th>
                <th>{t('plans.col_devices')}</th>
                <th>{t('common.status')}</th>
              </tr>
            </thead>
            <tbody>
              {vipPlans.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <Link href={adminHref(`/plans/${plan.id}`)}>
                      {pick(plan.name, locale, plan.slug)}
                    </Link>
                  </td>
                  <td>{formatMoney(plan.priceMinor, plan.currency, intl)}</td>
                  <td>
                    {plan.durationDays === null
                      ? t('plans.lifetime')
                      : t('plans.days', { count: plan.durationDays })}
                  </td>
                  <td>{plan.deviceLimit}</td>
                  <td>
                    <PublishPill status={plan.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="a-hint">
          {t('p3.vip_manage_people')}{' '}
          <Link href={adminHref('/entitlements')}>{t('nav.entitlements')}</Link>
        </p>
      </div>
    </>
  )
}
