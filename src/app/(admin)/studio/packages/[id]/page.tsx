import { and, asc, eq, isNull } from 'drizzle-orm'
import { formatMoney } from '@/lib/money'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activities as activityTable,
  itineraries,
  packageActivities,
  packageRegions,
  packages,
  plans,
} from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { packageCost } from '@/lib/packages/cost'
import { loadOffers } from '@/lib/suppliers/offers'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  Select,
  StatusField,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { SortableList } from '../../../_ui/sortable'
import { Pill } from '../../../_ui/table'
import { getAdminI18n } from '../../../_lib/i18n'
import {
  addPackageActivity,
  deletePackage,
  removePackageActivity,
  reorderPackageActivities,
  savePackage,
  savePackageActivity,
} from '../actions'

export const dynamic = 'force-dynamic'

export default async function PackageEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
  const { t, locale, intl } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const pkg = isNew
    ? null
    : ((
        await db
          .select()
          .from(packages)
          .where(and(eq(packages.id, id), isNull(packages.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !pkg) notFound()

  const [regions, activities, mediaList, selectedActivities, selectedRegions] = await Promise.all([
    regionOptions(),
    activityOptions(),
    mediaOptions(),
    pkg
      ? db
          .select({
            activityId: packageActivities.activityId,
            dayOffset: packageActivities.dayOffset,
            name: activityTable.name,
            slug: activityTable.slug,
          })
          .from(packageActivities)
          .innerJoin(activityTable, eq(activityTable.id, packageActivities.activityId))
          .where(eq(packageActivities.packageId, pkg.id))
          .orderBy(asc(packageActivities.sortOrder))
      : Promise.resolve([]),
    pkg
      ? db
          .select({ regionId: packageRegions.regionId })
          .from(packageRegions)
          .where(eq(packageRegions.packageId, pkg.id))
      : Promise.resolve([]),
  ])

  // Phase 3: itineraries and VIP plans it can include; cost and margin.
  const [itineraryRows, vipPlans] = await Promise.all([
    db
      .select({
        id: itineraries.id,
        slug: itineraries.slug,
        name: itineraries.name,
        status: itineraries.status,
      })
      .from(itineraries)
      .where(isNull(itineraries.deletedAt))
      .orderBy(asc(itineraries.slug)),
    db
      .select({ id: plans.id, slug: plans.slug, name: plans.name, status: plans.status })
      .from(plans)
      .where(and(eq(plans.entitlementKind, 'vip'), isNull(plans.deletedAt)))
      .orderBy(asc(plans.priceMinor)),
  ])
  const costGuests = pkg ? Math.max(1, Math.min(2, pkg.maxGuests)) : 1
  const offers = await loadOffers(selectedActivities.map((row) => row.activityId))
  const cost = pkg
    ? packageCost({
        activityIds: selectedActivities.map((row) => row.activityId),
        offersByActivity: offers,
        guests: costGuests,
        currency: pkg.currency,
        priceMinor: pkg.priceMinor,
        pricingMode: pkg.pricingMode === 'per_guest' ? 'per_guest' : 'flat',
        now: new Date(),
      })
    : null
  const money = (minor: number, currency: string) => formatMoney(minor, currency, intl)
  const supplierName = new Map(
    [...offers.values()].flat().map((offer) => [offer.id, offer.supplierName] as const),
  )
  const taken = new Set(selectedActivities.map((row) => row.activityId))
  const dayChoices = pkg ? Array.from({ length: Math.max(1, pkg.days) }, (_, i) => i + 1) : []
  const daySelect = (id: string, value: number | null) => (
    <Field label={t('p3.pkg_day')} htmlFor={id}>
      <select
        className="a-select a-pkg-day"
        id={id}
        name="day"
        defaultValue={value === null ? '' : String(value + 1)}
      >
        <option value="">{t('p3.pkg_day_unset')}</option>
        {dayChoices.map((day) => (
          <option key={day} value={String(day)}>
            {t('itineraries.day_number', { number: day })}
          </option>
        ))}
      </select>
    </Field>
  )

  return (
    <>
      <PageHead
        title={pkg ? pick(pkg.name, locale, pkg.slug) : t('packages.new')}
        actions={
          <>
            {pkg ? (
              <Pill tone={pkg.status === 'published' ? 'good' : 'neutral'}>
                {pkg.status === 'published' ? t('common.published') : t('common.draft')}
              </Pill>
            ) : null}
            {pkg ? (
              <a
                className="a-btn ghost"
                href={`/ar/packages/${pkg.slug}/preview`}
                target="_blank"
                rel="noopener"
              >
                {t('p3.pkg_preview')}
              </a>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/packages')}>
              {t('packages.back_to_list')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePackage.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('packages.section_identity')}</h2>
          <div className="a-row">
            <Field label={t('packages.slug_required')} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={pkg?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', pkg?.legacyId ?? '']]}
            >
              <Field label={t('packages.legacy_id')} htmlFor="legacyId">
                <TextInput id="legacyId" name="legacyId" defaultValue={pkg?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <StatusField value={pkg?.status} />
          </div>
        </div>

        <div className="a-card">
          <h2>{t('packages.section_copy')}</h2>
          <LocalizedField name="name" label={t('packages.f_name')} value={pkg?.name} required />
          <LocalizedField name="blurb" label={t('packages.f_blurb')} value={pkg?.blurb} rows={4} />
        </div>

        <div className="a-card">
          <h2>{t('packages.section_commercial')}</h2>
          <div className="a-row">
            <MoneyField minor={pkg?.priceMinor} currency={pkg?.currency} />
            <Field
              label={t('packages.pricing_mode')}
              htmlFor="pricingMode"
              hint={t('packages.pricing_mode_hint')}
            >
              <Select id="pricingMode" name="pricingMode" defaultValue={pkg?.pricingMode ?? 'flat'}>
                <option value="flat">{t('packages.flat_option')}</option>
                <option value="per_guest">{t('packages.per_guest_option')}</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <Field label={t('packages.days')} htmlFor="days">
              <TextInput
                id="days"
                name="days"
                inputMode="numeric"
                defaultValue={String(pkg?.days ?? 1)}
              />
            </Field>
            <Field label={t('packages.max_guests')} htmlFor="maxGuests">
              <TextInput
                id="maxGuests"
                name="maxGuests"
                inputMode="numeric"
                defaultValue={String(pkg?.maxGuests ?? 4)}
              />
            </Field>
            <Checkbox
              name="driverIncluded"
              label={t('packages.f_driver')}
              defaultChecked={pkg?.driverIncluded ?? false}
              hint={t('packages.f_driver_hint')}
            />
            <OptionField
              name="heroImageId"
              label={t('packages.hero_image')}
              options={mediaList}
              value={pkg?.heroImageId}
            />
          </div>
          <Field
            label={t('packages.f_amenities')}
            htmlFor="amenities"
            hint={t('packages.f_amenities_hint')}
          >
            <TextArea
              id="amenities"
              name="amenities"
              rows={4}
              defaultValue={(pkg?.amenities ?? []).join('\n')}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('packages.section_included')}</h2>
          <LocalizedListField
            name="included"
            label={t('packages.included')}
            values={pkg?.included}
          />
          <LocalizedListField
            name="excluded"
            label={t('packages.excluded')}
            values={pkg?.excluded}
          />
        </div>

        <div className="a-card">
          <h2>{t('packages.section_contents')}</h2>
          <div className="a-row">
            <Field
              label={t('p3.pkg_itinerary')}
              htmlFor="itineraryId"
              hint={t('p3.pkg_itinerary_hint')}
            >
              <select
                className="a-select"
                id="itineraryId"
                name="itineraryId"
                defaultValue={pkg?.itineraryId ?? ''}
              >
                <option value="">{t('p3.pkg_no_itinerary')}</option>
                {itineraryRows.map((row) => (
                  <option key={row.id} value={row.id}>
                    {pick(row.name, locale, row.slug)}
                    {row.status === 'published' ? '' : ` (${t('common.draft')})`}
                  </option>
                ))}
              </select>
            </Field>
            <Checkbox
              name="includesVip"
              label={t('p3.pkg_vip')}
              defaultChecked={pkg?.includesVip ?? false}
              hint={t('p3.pkg_vip_hint')}
            />
            <Field label={t('p3.vip_plan')} htmlFor="vipPlanId">
              <select
                className="a-select"
                id="vipPlanId"
                name="vipPlanId"
                defaultValue={pkg?.vipPlanId ?? ''}
              >
                <option value="">—</option>
                {vipPlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {pick(plan.name, locale, plan.slug)}
                    {plan.status === 'published' ? '' : ` (${t('common.draft')})`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <OptionChecklist
            name="regionIds"
            label={t('packages.f_regions')}
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('packages.save')}
          </button>
        </div>
      </form>

      {pkg ? (
        <div className="a-card">
          <h2>{t('p3.pkg_activities')}</h2>
          <p className="a-hint">{t('p3.pkg_activities_hint')}</p>
          {selectedActivities.length === 0 ? (
            <p className="a-hint">{t('p3.pkg_activities_empty')}</p>
          ) : (
            <SortableList
              hint={selectedActivities.length > 1 ? t('ae.order_hint') : undefined}
              onSave={reorderPackageActivities.bind(null, pkg.id)}
              rows={selectedActivities.map((row) => ({
                id: row.activityId,
                label: pick(row.name, locale, row.slug),
                content: (
                  <form
                    className="a-inc-row"
                    action={savePackageActivity.bind(null, pkg.id, row.activityId)}
                  >
                    <b>{pick(row.name, locale, row.slug)}</b>
                    {daySelect(`day_${row.activityId}`, row.dayOffset)}
                    <span className="a-actions">
                      <button className="a-btn ghost small" type="submit">
                        {t('p3.link_save')}
                      </button>
                      <button
                        className="a-btn danger small"
                        type="submit"
                        formAction={removePackageActivity.bind(null, pkg.id, row.activityId)}
                      >
                        {t('common.remove')}
                      </button>
                    </span>
                  </form>
                ),
              }))}
            />
          )}
          {activities.some((option) => !taken.has(option.value)) ? (
            <form className="a-inc-row a-inc-new" action={addPackageActivity.bind(null, pkg.id)}>
              <Field label={t('packages.f_activities')} htmlFor="pkg-new-activity">
                <select
                  className="a-select"
                  id="pkg-new-activity"
                  name="activityId"
                  defaultValue=""
                  required
                >
                  <option value="" disabled>
                    {t('p3.pkg_choose_activity')}
                  </option>
                  {activities
                    .filter((option) => !taken.has(option.value))
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </Field>
              {daySelect('pkg-new-day', null)}
              <span className="a-actions">
                <button className="a-btn small" type="submit">
                  {t('p3.pkg_add_activity')}
                </button>
              </span>
            </form>
          ) : null}
        </div>
      ) : null}

      {pkg && cost ? (
        <div className="a-card">
          <h2>{t('p3.pkg_cost')}</h2>
          <p className="a-hint">{t('p3.pkg_cost_hint', { n: costGuests })}</p>
          {selectedActivities.length === 0 ? (
            <p className="a-hint">{t('p3.pkg_activities_empty')}</p>
          ) : (
            <div className="a-table-wrap">
              <table className="a-table a-cost-table">
                <thead>
                  <tr>
                    <th>{t('packages.f_activities')}</th>
                    <th>{t('p3.pkg_cost_supplier')}</th>
                    <th>{t('p3.pkg_cost_amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {cost.lines.map((line) => {
                    const row = selectedActivities.find((one) => one.activityId === line.activityId)
                    return (
                      <tr key={line.activityId}>
                        <td>{row ? pick(row.name, locale, row.slug) : line.activityId}</td>
                        <td>
                          {line.offerId ? (
                            (supplierName.get(line.offerId) ?? '—')
                          ) : (
                            <Pill tone="warn">{t('p3.pkg_cost_no_supplier')}</Pill>
                          )}
                        </td>
                        <td className="num">
                          {line.costMinor !== null && line.currency
                            ? money(line.costMinor, line.currency)
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th colSpan={2}>{t('p3.pkg_cost_total')}</th>
                    <td className="num">
                      {cost.totalMinor !== null ? money(cost.totalMinor, pkg.currency) : '—'}
                    </td>
                  </tr>
                  <tr>
                    <th colSpan={2}>{t('p3.pkg_cost_price', { n: costGuests })}</th>
                    <td className="num">{money(cost.priceMinor, pkg.currency)}</td>
                  </tr>
                  <tr>
                    <th colSpan={2}>{t('p3.pkg_cost_margin')}</th>
                    <td className="num">
                      {cost.marginMinor !== null ? (
                        <Pill tone={cost.marginMinor >= 0 ? 'good' : 'bad'}>
                          {money(cost.marginMinor, pkg.currency)}
                          {cost.marginBps !== null
                            ? ` · ${(cost.marginBps / 100).toFixed(1)}%`
                            : ''}
                        </Pill>
                      ) : (
                        t('p3.pkg_cost_incomplete', { n: cost.missing })
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      ) : null}

      {pkg ? (
        <form className="a-card" action={deletePackage.bind(null, pkg.id)}>
          <h2>{t('packages.section_archive')}</h2>
          <p className="a-hint">{t('packages.archive_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('packages.archive')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
