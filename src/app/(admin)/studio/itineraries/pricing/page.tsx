import { and, asc, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { plans } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { mapBundleSaving } from '@/lib/itineraries/savings'
import { studioMoney as formatMoney } from '@/lib/currency/studio'
import { formatMoneyInput } from '@/lib/money-input'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { requireCapability } from '../../../_lib/session'
import {
  Checkbox,
  Field,
  LocalizedField,
  PriceLockNote,
  TextInput,
  priceInputProps,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { PageHead } from '../../../_ui/shell'
import { saveItinerarySales } from '../phase1-actions'

export const dynamic = 'force-dynamic'

const DEFAULT_PRICE_ROWS = 12

/** Studio → Itineraries → Packages & prices (`itinerarySales`, spec §5/§6/§6.1). */
export default async function ItineraryPricingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.read')
  const { t, intl, locale } = await getAdminI18n()
  const params = await searchParams
  const settings = await readItinerarySales()
  const mayWrite = can(session.role, 'content.publish')
  const pricesLocked = !can(session.role, 'prices.write')

  // The map's full price = the existing map product (spec §0): the chosen
  // plan, or the cheapest published map/VIP plan.
  const mapPlans = await db
    .select({
      id: plans.id,
      slug: plans.slug,
      name: plans.name,
      priceMinor: plans.priceMinor,
      currency: plans.currency,
      status: plans.status,
    })
    .from(plans)
    .where(and(inArray(plans.entitlementKind, ['map_access', 'vip']), isNull(plans.deletedAt)))
    .orderBy(asc(plans.priceMinor))
  const fullPlan =
    mapPlans.find((p) => p.id === settings.mapPlanId) ??
    mapPlans.find((p) => p.status === 'published' && p.currency === settings.currency) ??
    null
  const example =
    fullPlan && fullPlan.currency === settings.currency
      ? mapBundleSaving(fullPlan.priceMinor, settings.mapBundlePriceMinor)
      : null
  const money = (minor: number) => formatMoney(minor, settings.currency, intl)

  return (
    <>
      <PageHead
        title={t('ip1.pricing_t')}
        description={t('ip1.pricing_description')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/itineraries')}>
            {t('itineraries.back_to_list')}
          </Link>
        }
      />
      <Flash searchParams={params} />

      <div className="a-card">
        <h2>{t('ip1.example_t')}</h2>
        {example ? (
          <p>
            {t('ip1.example_map', {
              bundle: money(example.bundleMinor),
              full: money(example.fullMinor),
              saving: money(example.savingMinor),
            })}
          </p>
        ) : (
          <p className="a-hint">{t('ip1.example_no_map')}</p>
        )}
        <p>
          {settings.allActivitiesDiscountPct > 0
            ? t('ip1.example_bundle', {
                pct: settings.allActivitiesDiscountPct,
                uses: settings.usesPerPurchase,
              })
            : t('ip1.example_bundle_off')}
        </p>
      </div>

      <form className="a-form" action={saveItinerarySales}>
        <fieldset disabled={!mayWrite} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="a-card">
            <h2>{t('ip1.options_t')}</h2>
            <p className="a-hint">{t('ip1.options_hint')}</p>
            <Checkbox
              name="optOnlyEnabled"
              label={t('ip1.opt_only_enabled')}
              defaultChecked={settings.options.itineraryOnly.enabled}
            />
            <LocalizedField
              name="optOnlyLabel"
              label={t('ip1.opt_label')}
              value={settings.options.itineraryOnly.label}
            />
            <LocalizedField
              name="optOnlyBadge"
              label={t('ip1.opt_badge')}
              value={settings.options.itineraryOnly.badge}
            />
            <hr />
            <Checkbox
              name="optMapEnabled"
              label={t('ip1.opt_map_enabled')}
              defaultChecked={settings.options.withMap.enabled}
            />
            <LocalizedField
              name="optMapLabel"
              label={t('ip1.opt_label')}
              value={settings.options.withMap.label}
            />
            <LocalizedField
              name="optMapBadge"
              label={t('ip1.opt_badge')}
              value={settings.options.withMap.badge}
            />
            <LocalizedField
              name="popularBadge"
              label={t('ip1.popular_badge')}
              value={settings.popularBadge}
              hint={t('ip1.popular_badge_hint')}
            />
          </div>

          <div className="a-card">
            <h2>{t('ip1.map_price_t')}</h2>
            {pricesLocked && <PriceLockNote />}
            <div className="a-row">
              <Field
                label={t('ip1.map_bundle_price', { currency: settings.currency })}
                htmlFor="mapBundlePrice"
                hint={t('ip1.map_bundle_price_hint')}
              >
                <TextInput
                  id="mapBundlePrice"
                  name="mapBundlePrice"
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={formatMoneyInput(settings.mapBundlePriceMinor, settings.currency)}
                  {...priceInputProps(pricesLocked)}
                />
              </Field>
              <Field label={t('ip1.map_plan')} htmlFor="mapPlanId" hint={t('ip1.map_plan_hint')}>
                <select
                  className="a-select"
                  id="mapPlanId"
                  name="mapPlanId"
                  defaultValue={settings.mapPlanId}
                >
                  <option value="">{t('ip1.map_plan_auto')}</option>
                  {mapPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {pick(plan.name, locale, plan.slug)} —{' '}
                      {formatMoney(plan.priceMinor, plan.currency, intl)}
                      {plan.status === 'published' ? '' : ` (${t('common.draft')})`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>

          <div className="a-card">
            <h2>{t('ip1.bundle_t')}</h2>
            <p className="a-hint">{t('ip1.bundle_hint')}</p>
            <div className="a-row">
              <Field label={t('ip1.bundle_pct')} htmlFor="allActivitiesDiscountPct">
                <TextInput
                  id="allActivitiesDiscountPct"
                  name="allActivitiesDiscountPct"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(settings.allActivitiesDiscountPct)}
                  {...priceInputProps(pricesLocked)}
                />
              </Field>
              <Field label={t('ip1.uses_per_purchase')} htmlFor="usesPerPurchase">
                <TextInput
                  id="usesPerPurchase"
                  name="usesPerPurchase"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(settings.usesPerPurchase)}
                />
              </Field>
              <Checkbox
                name="discountIncludesDriver"
                label={t('ip1.discount_includes_driver')}
                defaultChecked={settings.discountIncludesDriver}
              />
            </div>
          </div>

          <div className="a-card">
            <h2>{t('ip1.default_prices_t')}</h2>
            <p className="a-hint">
              {t('ip1.default_prices_hint', { currency: settings.currency })}
            </p>
            {Array.from({ length: DEFAULT_PRICE_ROWS }, (_, i) => {
              const row = settings.defaultPrices[i]
              return (
                <div className="a-row" key={i}>
                  <Field label={t('ip1.dp_days')} htmlFor={`dp${i}Days`}>
                    <TextInput
                      id={`dp${i}Days`}
                      name={`dp${i}Days`}
                      inputMode="numeric"
                      dir="ltr"
                      defaultValue={row ? String(row.days) : ''}
                      {...priceInputProps(pricesLocked)}
                    />
                  </Field>
                  <Field label={t('ip1.dp_price')} htmlFor={`dp${i}Price`}>
                    <TextInput
                      id={`dp${i}Price`}
                      name={`dp${i}Price`}
                      inputMode="decimal"
                      dir="ltr"
                      defaultValue={row ? formatMoneyInput(row.priceMinor, settings.currency) : ''}
                      {...priceInputProps(pricesLocked)}
                    />
                  </Field>
                </div>
              )
            })}
          </div>

          <div className="a-card">
            <h2>{t('ip1.delivery_t')}</h2>
            <div className="a-row">
              <Field label={t('ip1.link_days')} htmlFor="linkValidDays">
                <TextInput
                  id="linkValidDays"
                  name="linkValidDays"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(settings.linkValidDays)}
                />
              </Field>
              <Field label={t('ip1.link_uses')} htmlFor="linkMaxUses">
                <TextInput
                  id="linkMaxUses"
                  name="linkMaxUses"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(settings.linkMaxUses)}
                />
              </Field>
              <Field
                label={t('ip1.max_upload_mb')}
                htmlFor="maxUploadMb"
                hint={t('ip1.max_upload_mb_hint')}
              >
                <TextInput
                  id="maxUploadMb"
                  name="maxUploadMb"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(settings.maxUploadMb)}
                />
              </Field>
            </div>
          </div>

          {mayWrite ? (
            <div className="a-actions">
              <button className="a-btn" type="submit">
                {t('ip1.save_settings')}
              </button>
            </div>
          ) : null}
        </fieldset>
      </form>
    </>
  )
}
