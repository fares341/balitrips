import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  itineraries,
  itineraryDayPlaces,
  itineraryDays,
  itineraryPackageLinks,
  itineraryRegions,
  mapPlaces,
  packages,
  plans,
} from '@/db/schema'
import { placeAccess } from '@/lib/entitlements/redaction'
import { MAP_ACCESS, PACKAGE_PRICE_RULES, mapAccessOf } from '@/lib/itineraries/sale'
import { ITINERARY_TIERS, normaliseTierPrices } from '@/lib/itineraries/tiers'
import { formatMoneyInput } from '@/lib/money-input'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { locales, localeConfig } from '@/i18n/config'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, placeOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  PriceLockNote,
  priceInputProps,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { Pill } from '../../../_ui/table'
import { SortableList } from '../../../_ui/sortable'
import {
  addItineraryPackageLink,
  deleteItinerary,
  removeItineraryPackageLink,
  reorderItineraryPackageLinks,
  saveItineraryPackageLink,
  publishItinerary,
  removeItineraryPdf,
  saveItinerary,
  unpublishItinerary,
  uploadItineraryPdf,
} from '../actions'
import { getAdminI18n } from '../../../_lib/i18n'
import { DayPlan } from './day-plan'
import type { DayStopDraft, PlaceChoice } from './day-places-editor'

export const dynamic = 'force-dynamic'

export default async function ItineraryEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
  const pricesLocked = !can(session.role, 'prices.write')
  const { t, locale: uiLocale } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const itinerary = isNew
    ? null
    : ((
        await db
          .select()
          .from(itineraries)
          .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !itinerary) notFound()

  const [regions, mediaList, activities, days, selectedRegions, places] = await Promise.all([
    regionOptions(),
    mediaOptions(),
    activityOptions(),
    itinerary
      ? db
          .select({
            id: itineraryDays.id,
            dayNumber: itineraryDays.dayNumber,
            activityId: itineraryDays.activityId,
            isFreeDay: itineraryDays.isFreeDay,
            title: itineraryDays.title,
            description: itineraryDays.description,
            bookable: itineraryDays.bookable,
          })
          .from(itineraryDays)
          .where(eq(itineraryDays.itineraryId, itinerary.id))
          .orderBy(asc(itineraryDays.dayNumber))
      : Promise.resolve([]),
    itinerary
      ? db
          .select({ regionId: itineraryRegions.regionId })
          .from(itineraryRegions)
          .where(eq(itineraryRegions.itineraryId, itinerary.id))
      : Promise.resolve([]),
    placeOptions(),
  ])

  // Phase 3: plans that can be offered as VIP, packages to sell it inside,
  // the places of each day, and every place for the day-plan search.
  const [vipPlans, packageRows, links, placeRows, stopRows] = await Promise.all([
    db
      .select({ id: plans.id, slug: plans.slug, name: plans.name, status: plans.status })
      .from(plans)
      .where(and(eq(plans.entitlementKind, 'vip'), isNull(plans.deletedAt)))
      .orderBy(asc(plans.priceMinor)),
    db
      .select({
        id: packages.id,
        slug: packages.slug,
        name: packages.name,
        status: packages.status,
      })
      .from(packages)
      .where(isNull(packages.deletedAt))
      .orderBy(asc(packages.slug)),
    itinerary
      ? db
          .select({
            packageId: itineraryPackageLinks.packageId,
            priceRule: itineraryPackageLinks.priceRule,
            isDefault: itineraryPackageLinks.isDefault,
          })
          .from(itineraryPackageLinks)
          .where(eq(itineraryPackageLinks.itineraryId, itinerary.id))
          .orderBy(asc(itineraryPackageLinks.sortOrder))
      : Promise.resolve([]),
    db
      .select({
        id: mapPlaces.id,
        slug: mapPlaces.slug,
        name: mapPlaces.name,
        isFree: mapPlaces.isFree,
        requiredEntitlement: mapPlaces.requiredEntitlement,
        isHiddenGem: mapPlaces.isHiddenGem,
        status: mapPlaces.status,
      })
      .from(mapPlaces)
      .where(isNull(mapPlaces.deletedAt))
      .orderBy(asc(mapPlaces.slug)),
    days.length > 0
      ? db
          .select({
            id: itineraryDayPlaces.id,
            dayId: itineraryDayPlaces.dayId,
            placeId: itineraryDayPlaces.placeId,
            note: itineraryDayPlaces.note,
            visitTime: itineraryDayPlaces.visitTime,
          })
          .from(itineraryDayPlaces)
          .where(
            inArray(
              itineraryDayPlaces.dayId,
              days.map((day) => day.id),
            ),
          )
          .orderBy(asc(itineraryDayPlaces.sortOrder))
      : Promise.resolve([]),
  ])
  const placeChoices: PlaceChoice[] = placeRows.map((row) => {
    const access = placeAccess(row)
    const name = pick(row.name, uiLocale, row.slug)
    return {
      value: row.id,
      label: row.status === 'published' ? name : `${name} (${t('common.draft')})`,
      access: access.isFree ? 'free' : access.requiredEntitlement,
    }
  })
  const stopsByDay = new Map<string, DayStopDraft[]>()
  for (const row of stopRows) {
    const list = stopsByDay.get(row.dayId) ?? []
    list.push({
      id: row.id,
      placeId: row.placeId,
      note: { ar: row.note?.ar ?? '', en: row.note?.en ?? '', id: row.note?.id ?? '' },
      visitTime: row.visitTime ?? '',
    })
    stopsByDay.set(row.dayId, list)
  }
  const packageName = new Map(
    packageRows.map((row) => [row.id, pick(row.name, uiLocale, row.slug)] as const),
  )
  const linkedIds = new Set(links.map((link) => link.packageId))
  const mapAccess = itinerary ? mapAccessOf(itinerary) : 'free_only'

  const title = itinerary ? pick(itinerary.name, uiLocale, itinerary.slug) : t('itineraries.new')
  const mayPublish = can(session.role, 'content.publish')

  return (
    <>
      <PageHead
        title={title}
        description={
          itinerary
            ? t('itineraries.edit_description', {
                version: itinerary.version,
                count: days.length,
                path: `/itineraries/${itinerary.slug}`,
              })
            : t('itineraries.new_description')
        }
        actions={
          <>
            {itinerary ? (
              <Pill tone={itinerary.status === 'published' ? 'good' : 'neutral'}>
                {itinerary.status === 'published' ? t('common.published') : t('common.draft')}
              </Pill>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/itineraries')}>
              {t('itineraries.back_to_list')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveItinerary.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('itineraries.section_identity')}</h2>
          <div className="a-row">
            <Field
              label={t('itineraries.slug_required')}
              htmlFor="slug"
              hint={t('itineraries.slug_hint')}
            >
              <TextInput
                id="slug"
                name="slug"
                defaultValue={itinerary?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', itinerary?.legacyId ?? '']]}
            >
              <Field label={t('itineraries.legacy_id')} htmlFor="legacyId">
                <TextInput id="legacyId" name="legacyId" defaultValue={itinerary?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <Field
              label={t('itineraries.f_spots')}
              htmlFor="spots"
              hint={t('itineraries.f_spots_hint')}
            >
              <TextInput
                id="spots"
                name="spots"
                inputMode="numeric"
                defaultValue={
                  itinerary?.spots === null || itinerary?.spots === undefined
                    ? ''
                    : String(itinerary.spots)
                }
              />
            </Field>
          </div>
          <p className="a-hint">{t('itineraries.length_hint')}</p>
        </div>

        <div className="a-card">
          <h2>{t('itineraries.section_copy')}</h2>
          <LocalizedField
            name="name"
            label={t('itineraries.f_name')}
            value={itinerary?.name}
            required
          />
          <LocalizedField
            name="tripType"
            label={t('itineraries.f_trip_type')}
            value={itinerary?.tripType}
          />
          <LocalizedField
            name="blurb"
            label={t('itineraries.f_blurb')}
            value={itinerary?.blurb}
            rows={4}
          />
          <LocalizedListField
            name="audience"
            label={t('itineraries.f_audience')}
            values={itinerary?.audience}
            hint={t('itineraries.f_audience_hint')}
          />
          <LocalizedField
            name="detailedDescription"
            label={t('itineraries.f_detailed_description')}
            value={itinerary?.detailedDescription}
            rows={6}
          />
        </div>

        <div className="a-card">
          <h2>{t('p3.section_sale')}</h2>
          <p className="a-hint">{t('p3.sale_hint')}</p>
          <div className="a-row">
            <Checkbox
              name="saleDigital"
              label={t('p3.sale_digital')}
              defaultChecked={itinerary?.saleDigital ?? true}
              hint={t('p3.sale_digital_hint')}
            />
            <Checkbox
              name="saleWithActivities"
              label={t('p3.sale_activities')}
              defaultChecked={itinerary?.saleWithActivities ?? false}
              hint={t('p3.sale_activities_hint')}
            />
            <Checkbox
              name="saleWithPackages"
              label={t('p3.sale_packages')}
              defaultChecked={itinerary?.saleWithPackages ?? false}
              hint={t('p3.sale_packages_hint')}
            />
            <Checkbox
              name="saleCustomRequest"
              label={t('p3.sale_custom')}
              defaultChecked={itinerary?.saleCustomRequest ?? false}
              hint={t('p3.sale_custom_hint')}
            />
          </div>
        </div>

        <div className="a-card">
          <h2>{t('itineraries.section_access')}</h2>
          <fieldset className="a-fieldset">
            <legend>{t('p3.map_access')}</legend>
            <span className="a-hint">{t('p3.map_access_hint')}</span>
            {MAP_ACCESS.map((value) => (
              <label key={value} className="a-check">
                <input
                  type="radio"
                  name="mapAccess"
                  value={value}
                  defaultChecked={mapAccess === value}
                />
                <span>
                  <b>{t(`p3.map_${value}`)}</b>
                  <span className="a-hint" style={{ display: 'block' }}>
                    {t(`p3.map_${value}_hint`)}
                  </span>
                </span>
              </label>
            ))}
          </fieldset>
          <Field label={t('p3.vip_plan')} htmlFor="vipPlanId" hint={t('p3.vip_plan_hint')}>
            <select
              className="a-select"
              id="vipPlanId"
              name="vipPlanId"
              defaultValue={itinerary?.vipPlanId ?? ''}
            >
              <option value="">{t('p3.vip_plan_auto')}</option>
              {vipPlans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {pick(plan.name, uiLocale, plan.slug)}
                  {plan.status === 'published' ? '' : ` (${t('common.draft')})`}
                </option>
              ))}
            </select>
          </Field>
          {vipPlans.length === 0 ? <p className="a-hint">{t('p3.no_vip_plans')}</p> : null}
          <Field
            label={t('itineraries.f_internal_notes')}
            htmlFor="internalNotes"
            hint={t('itineraries.f_internal_notes_hint')}
          >
            <TextArea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              defaultValue={itinerary?.internalNotes ?? ''}
            />
          </Field>
          <OptionChecklist
            name="galleryImageIds"
            label={t('itineraries.f_gallery')}
            options={mediaList}
            values={itinerary?.galleryImageIds ?? []}
          />
          <OptionChecklist
            name="linkedPlaceIds"
            label={t('itineraries.f_linked_places')}
            options={places}
            values={itinerary?.linkedPlaceIds ?? []}
          />
        </div>

        <div className="a-card">
          <h2>{t('itineraries.section_commercial')}</h2>
          <div className="a-row">
            <MoneyField
              minor={itinerary?.priceMinor}
              currency={itinerary?.currency}
              locked={pricesLocked}
            />
            <OptionField
              name="heroImageId"
              label={t('itineraries.hero_image')}
              options={mediaList}
              value={itinerary?.heroImageId}
            />
          </div>
          <OptionChecklist
            name="regionIds"
            label={t('itineraries.f_regions')}
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
        </div>

        <div className="a-card">
          <h2>{t('itineraries.tiers_t')}</h2>
          <p className="a-hint">{t('itineraries.tiers_hint')}</p>
          {pricesLocked && <PriceLockNote />}
          <div className="a-row">
            {ITINERARY_TIERS.map((key) => {
              const minor = normaliseTierPrices(itinerary?.tierPrices)[key]
              return (
                <Field key={key} label={t(`itineraries.tier_${key}`)} htmlFor={`tier_${key}`}>
                  <TextInput
                    id={`tier_${key}`}
                    name={`tier_${key}`}
                    inputMode="decimal"
                    dir="ltr"
                    defaultValue={
                      minor === undefined
                        ? ''
                        : formatMoneyInput(minor, itinerary?.currency ?? 'USD')
                    }
                    {...priceInputProps(pricesLocked)}
                  />
                </Field>
              )
            })}
          </div>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('itineraries.save')}
          </button>
        </div>
      </form>

      {itinerary ? (
        <>
          <DayPlan
            itineraryId={itinerary.id}
            days={days}
            activities={activities}
            stopsByDay={stopsByDay}
            placeChoices={placeChoices}
          />

          <div className="a-card">
            <h2>{t('p3.section_packages')}</h2>
            <p className="a-hint">{t('p3.packages_hint')}</p>
            {pricesLocked && <PriceLockNote />}
            {!itinerary.saleWithPackages ? <p className="a-hint">{t('p3.packages_off')}</p> : null}
            {links.length === 0 ? (
              <p className="a-hint">{t('p3.packages_empty')}</p>
            ) : (
              <SortableList
                hint={links.length > 1 ? t('ae.order_hint') : undefined}
                onSave={reorderItineraryPackageLinks.bind(null, itinerary.id)}
                rows={links.map((link) => ({
                  id: link.packageId,
                  label: packageName.get(link.packageId) ?? link.packageId,
                  content: (
                    <form
                      className="a-inc-row"
                      action={saveItineraryPackageLink.bind(null, itinerary.id, link.packageId)}
                    >
                      <b>{packageName.get(link.packageId) ?? link.packageId}</b>
                      <Field label={t('p3.price_rule')} htmlFor={`rule_${link.packageId}`}>
                        {pricesLocked && (
                          <input type="hidden" name="priceRule" value={link.priceRule} />
                        )}
                        <select
                          className="a-select"
                          id={`rule_${link.packageId}`}
                          name={pricesLocked ? undefined : 'priceRule'}
                          defaultValue={link.priceRule}
                          disabled={pricesLocked}
                        >
                          {PACKAGE_PRICE_RULES.map((rule) => (
                            <option key={rule} value={rule}>
                              {t(`p3.rule_${rule}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <label className="a-check">
                        <input type="checkbox" name="isDefault" defaultChecked={link.isDefault} />
                        {t('p3.link_default')}
                      </label>
                      <span className="a-actions">
                        <button className="a-btn ghost small" type="submit">
                          {t('p3.link_save')}
                        </button>
                        <button
                          className="a-btn danger small"
                          type="submit"
                          formAction={removeItineraryPackageLink.bind(
                            null,
                            itinerary.id,
                            link.packageId,
                          )}
                        >
                          {t('common.remove')}
                        </button>
                      </span>
                    </form>
                  ),
                }))}
              />
            )}
            {packageRows.some((row) => !linkedIds.has(row.id)) ? (
              <form
                className="a-inc-row a-inc-new"
                action={addItineraryPackageLink.bind(null, itinerary.id)}
              >
                <Field label={t('p3.link_package')} htmlFor="link-package">
                  <select
                    className="a-select"
                    id="link-package"
                    name="packageId"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      {t('p3.link_choose')}
                    </option>
                    {packageRows
                      .filter((row) => !linkedIds.has(row.id))
                      .map((row) => (
                        <option key={row.id} value={row.id}>
                          {pick(row.name, uiLocale, row.slug)}
                          {row.status === 'published' ? '' : ` (${t('common.draft')})`}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t('p3.price_rule')} htmlFor="link-rule">
                  {pricesLocked && <input type="hidden" name="priceRule" value="included" />}
                  <select
                    className="a-select"
                    id="link-rule"
                    name={pricesLocked ? undefined : 'priceRule'}
                    defaultValue="included"
                    disabled={pricesLocked}
                  >
                    {PACKAGE_PRICE_RULES.map((rule) => (
                      <option key={rule} value={rule}>
                        {t(`p3.rule_${rule}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <span className="a-actions">
                  <button className="a-btn small" type="submit">
                    {t('p3.link_add')}
                  </button>
                </span>
              </form>
            ) : null}
            <ul className="a-hint">
              {PACKAGE_PRICE_RULES.map((rule) => (
                <li key={rule}>
                  <b>{t(`p3.rule_${rule}`)}</b>: {t(`p3.rule_${rule}_hint`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="a-card">
            <h2>{t('itineraries.section_publishing')}</h2>
            <p className="a-hint">
              {t('itineraries.publishing_hint', {
                from: itinerary.version,
                to: itinerary.version + 1,
              })}
            </p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              {mayPublish ? (
                <>
                  <form
                    className="a-inline-form"
                    action={publishItinerary.bind(null, itinerary.id)}
                  >
                    <button className="a-btn accent" type="submit">
                      {t('itineraries.publish_version', { version: itinerary.version + 1 })}
                    </button>
                  </form>
                  {itinerary.status === 'published' ? (
                    <form
                      className="a-inline-form"
                      action={unpublishItinerary.bind(null, itinerary.id)}
                    >
                      <button className="a-btn ghost" type="submit">
                        {t('itineraries.move_to_draft')}
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <span className="a-hint">{t('itineraries.cannot_publish')}</span>
              )}
            </div>
          </div>

          <div className="a-card">
            <h2>{t('itineraries.section_pdf')}</h2>
            <p className="a-hint">{t('itineraries.pdf_hint')}</p>
            <ul>
              {locales.map((locale) => (
                <li key={locale}>
                  {localeConfig[locale].label}:{' '}
                  {itinerary.uploadedPdfKeys?.[locale] ? (
                    <form
                      className="a-inline-form"
                      action={removeItineraryPdf.bind(null, itinerary.id)}
                    >
                      <input type="hidden" name="locale" value={locale} />
                      <strong>{t('itineraries.pdf_uploaded')}</strong>{' '}
                      <button className="a-btn ghost small" type="submit">
                        {t('common.remove')}
                      </button>
                    </form>
                  ) : (
                    <span className="a-muted">{t('itineraries.pdf_generated')}</span>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="a-row"
              action={uploadItineraryPdf.bind(null, itinerary.id)}
              style={{ marginBlockStart: 12 }}
            >
              <Field label={t('itineraries.pdf_language')} htmlFor="pdf-locale">
                <select className="a-select" id="pdf-locale" name="locale" defaultValue="ar">
                  {locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {localeConfig[locale].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('itineraries.pdf_file')} htmlFor="pdf-file">
                <input
                  className="a-input"
                  id="pdf-file"
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                />
              </Field>
              <div className="a-actions">
                <button className="a-btn accent" type="submit">
                  {t('itineraries.pdf_upload')}
                </button>
              </div>
            </form>
          </div>

          <form className="a-card" action={deleteItinerary.bind(null, itinerary.id)}>
            <h2>{t('itineraries.section_archive')}</h2>
            <p className="a-hint">{t('itineraries.archive_hint')}</p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn danger" type="submit">
                {t('itineraries.archive')}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  )
}
