/**
 * Studio itinerary editor (redesigned Nov 2026 after the owner's report «قسم
 * الجداول مقيّد ولا أعرف كيف أعمل الأشياء»).
 *
 * One page, seven tabs (`?tab=`): الأساسيات · محتوى الصفحة · الأسئلة الشائعة ·
 * الأيام · الأسعار · ملف PDF · معاينة. Each tab is its own form and posts
 * only its own fields (`_sections` for the core form), so saving one tab
 * never touches another. A new itinerary opens on «الأساسيات» only; the
 * other tabs open after the first save. `<EditorShell>` carries the tab bar,
 * the «؟ دليل» guide and the unsaved-changes guard.
 */

import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'

import { db } from '@/db'
import {
  itineraries,
  itineraryDayPlaces,
  itineraryDocuments,
  itineraryDays,
  itineraryPackageLinks,
  itineraryRegions,
  mapPlaces,
  packages,
  plans,
} from '@/db/schema'
import type { BaliIconName } from '@/components/ui/bali-icon'
import { placeAccess } from '@/lib/entitlements/redaction'
import { deliveredPdf } from '@/lib/itineraries/delivered-pdf'
import {
  normalisePageContent,
  PAGE_TEXT_KEYS,
  type PageTextKey,
} from '@/lib/itineraries/page-content'
import { MAP_ACCESS, PACKAGE_PRICE_RULES, mapAccessOf } from '@/lib/itineraries/sale'
import { ITINERARY_TIERS, normaliseTierPrices } from '@/lib/itineraries/tiers'
import { formatMoneyInput } from '@/lib/money-input'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { defaultLocale, localeConfig, locales } from '@/i18n/config'

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
import { FaqRepeater, type FaqRepeaterEntry } from '../../../_ui/faq-repeater'
import { AreasCard, areaChoices } from './areas-card'
import { normaliseAreas } from '@/lib/itineraries/areas'
import { Flash } from '../../../_ui/flash'
import { loadPickerMedia, MediaPicker } from '../../../_ui/media-picker'
import { OptionChecklist } from '../../../_ui/select-field'
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
  saveItinerary,
  unpublishItinerary,
} from '../actions'
import {
  duplicateItinerary,
  saveItineraryAreas,
  saveItineraryFaq,
  savePageContent,
  setItineraryVisibility,
} from '../editor-actions'
import { ITINERARY_HELP_TABS, type ItineraryHelpTab } from '../_help'
import { salesByItinerary } from '../list-stats'
import { getAdminI18n } from '../../../_lib/i18n'
import { DayPlan } from './day-plan'
import { DayTeasersCard, PdfCard, PdfStatusPill, PreviewCard, type PdfDocRow } from './phase1-cards'
import { BuyerPageCard } from './buyer-page-card'
import { EditorShell, type EditorTab } from './editor-shell'
import { PageContentEditor, type PageContentDefaults } from './page-content-editor'
import { PdfDropzone } from './pdf-dropzone'
import { pdfStatus, publishBlock, type PdfStatus } from '@/lib/itineraries/publish-gate'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import type { DayStopDraft, PlaceChoice } from './day-places-editor'
import { ConfirmSubmit } from '../../../_ui/confirm-submit'
import '../editor.css'

export const dynamic = 'force-dynamic'

const isTab = (value: unknown): value is ItineraryHelpTab =>
  typeof value === 'string' && (ITINERARY_HELP_TABS as readonly string[]).includes(value)

type Lang = 'ar' | 'en' | 'id'
const CONTENT_LANGS: Lang[] = ['ar', 'en', 'id']

/** The site's own texts, per language — the placeholders of «محتوى الصفحة». */
async function contentDefaults(days: number, includesMap: boolean): Promise<PageContentDefaults> {
  const tr = Object.fromEntries(
    await Promise.all(
      CONTENT_LANGS.map(async (lang) => [lang, await getTranslations({ locale: lang })] as const),
    ),
  ) as Record<Lang, Awaited<ReturnType<typeof getTranslations>>>
  const per = (key: string, values?: Record<string, number>) =>
    Object.fromEntries(CONTENT_LANGS.map((lang) => [lang, tr[lang](key, values ?? {})])) as Record<
      Lang,
      string
    >
  const texts = Object.fromEntries(
    (Object.entries(PAGE_TEXT_KEYS) as [PageTextKey, string][]).map(([key, msg]) => [
      key,
      per(msg),
    ]),
  ) as PageContentDefaults['texts']
  const benefitKeys: { icon: BaliIconName; key: string; values?: Record<string, number> }[] = [
    { icon: 'calendar', key: 'itd_b_days', values: { n: days } },
    { icon: 'food', key: 'itd_b_food' },
    ...(includesMap ? [{ icon: 'pin' as const, key: 'itd_b_map' }] : []),
    { icon: 'clock', key: 'itd_b_time' },
    { icon: 'tip', key: 'itd_b_tips' },
    { icon: 'phone', key: 'itd_b_pdf' },
  ]
  return {
    texts,
    benefits: benefitKeys.map((b) => ({
      icon: b.icon,
      label: per(`${b.key}_t`),
      text: per(`${b.key}_b`, b.values),
    })),
    how: ['itd_how1', 'itd_how2', 'itd_how3'].map((key) => ({
      label: per(`${key}_t`),
      text: per(`${key}_b`),
    })),
  }
}

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
  const tab: ItineraryHelpTab = isNew ? 'basics' : isTab(query.tab) ? query.tab : 'basics'

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

  const [regions, mediaList, pickerMedia, activities, days, selectedRegions, places] =
    await Promise.all([
      regionOptions(),
      mediaOptions(),
      loadPickerMedia(),
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
              teaserImageId: itineraryDays.teaserImageId,
              teaserMood: itineraryDays.teaserMood,
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

  const [pdfDocs, sales, buyers] = await Promise.all([
    itinerary
      ? db
          .select({
            id: itineraryDocuments.id,
            locale: itineraryDocuments.locale,
            source: itineraryDocuments.source,
            fileVersion: itineraryDocuments.fileVersion,
            version: itineraryDocuments.version,
            isCurrent: itineraryDocuments.isCurrent,
            bytes: itineraryDocuments.bytes,
            downloadFilename: itineraryDocuments.downloadFilename,
            notifyBuyers: itineraryDocuments.notifyBuyers,
            createdAt: itineraryDocuments.createdAt,
            objectKey: itineraryDocuments.objectKey,
          })
          .from(itineraryDocuments)
          .where(eq(itineraryDocuments.itineraryId, itinerary.id))
          .orderBy(asc(itineraryDocuments.locale), desc(itineraryDocuments.fileVersion))
      : Promise.resolve([] as (PdfDocRow & { objectKey: string })[]),
    readItinerarySales(),
    itinerary ? salesByItinerary([itinerary.id]) : Promise.resolve(new Map<string, number>()),
  ])
  const buyerCount = itinerary ? (buyers.get(itinerary.id) ?? 0) : 0
  const unresolvedDays = days.filter((day) => !day.activityId && !day.isFreeDay).length
  const factsFor = (locale: string) => {
    const docs = pdfDocs.filter((doc) => doc.locale === locale)
    const current = docs.find((doc) => doc.source === 'uploaded' && doc.isCurrent)
    return {
      uploadedVersion: current?.fileVersion ?? (itinerary?.uploadedPdfKeys?.[locale] ? 1 : null),
      generatedExists: docs.some((doc) => doc.source === 'generated'),
      dayCount: days.length,
      unresolvedDays,
    }
  }
  const statusByLocale: Record<string, PdfStatus> = Object.fromEntries(
    locales.map((locale) => [locale, pdfStatus(factsFor(locale))]),
  )
  const block = publishBlock(factsFor('ar'))

  const title = itinerary ? pick(itinerary.name, uiLocale, itinerary.slug) : t('ie.new')
  const mayPublish = can(session.role, 'content.publish')
  const editorHref = (key: string) => adminHref(`/itineraries/${id}?tab=${key}`)
  const tabs: EditorTab[] = ITINERARY_HELP_TABS.map((key) => ({
    key,
    label: t(`ie.tab_${key}`),
    href: isNew ? adminHref('/itineraries/new') : editorHref(key),
    disabled: isNew && key !== 'basics',
  }))
  const status = itinerary?.status ?? 'draft'
  const statusTone = status === 'published' ? 'good' : status === 'hidden' ? 'warn' : 'neutral'
  const sectionsInput = (part: string) => (
    <>
      <input type="hidden" name="_sections" value={part} />
      <input type="hidden" name="_tab" value={tab} />
    </>
  )

  // -------------------------------------------------------------------------
  // Tabs
  // -------------------------------------------------------------------------

  const basicsTab = (
    <>
      {isNew ? <p className="a-hint ie-note">{t('ie.save_first')}</p> : null}
      <form className="a-form" action={saveItinerary.bind(null, isNew ? 'new' : id)}>
        {sectionsInput('basics')}
        <div className="a-card">
          <h2>{t('itineraries.section_copy')}</h2>
          <LocalizedField
            name="name"
            label={t('itineraries.f_name')}
            value={itinerary?.name}
            required
            anyLanguage
          />
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
                dir="ltr"
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field
              label={t('ie.days_count')}
              htmlFor="days-count"
              hint={t('ie.days_count_hint', { count: days.length })}
            >
              <TextInput id="days-count" value={String(days.length)} readOnly dir="ltr" />
            </Field>
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
          <Advanced
            show={session.role === 'admin'}
            title={t('common.advanced')}
            keep={[['legacyId', itinerary?.legacyId ?? '']]}
          >
            <Field label={t('itineraries.legacy_id')} htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={itinerary?.legacyId ?? ''} />
            </Field>
          </Advanced>
          <LocalizedField
            name="blurb"
            label={t('itineraries.f_blurb')}
            value={itinerary?.blurb}
            rows={3}
          />
          <LocalizedField
            name="tripType"
            label={t('itineraries.f_trip_type')}
            value={itinerary?.tripType}
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
          <h2>{t('ie.cover')}</h2>
          <MediaPicker
            name="heroImageId"
            label={t('ie.cover')}
            hint={t('ie.cover_hint')}
            items={pickerMedia}
            value={itinerary?.heroImageId}
          />
          <OptionChecklist
            name="galleryImageIds"
            label={t('itineraries.f_gallery')}
            options={mediaList}
            values={itinerary?.galleryImageIds ?? []}
          />
          <OptionChecklist
            name="regionIds"
            label={t('itineraries.f_regions')}
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
          <OptionChecklist
            name="linkedPlaceIds"
            label={t('itineraries.f_linked_places')}
            options={places}
            values={itinerary?.linkedPlaceIds ?? []}
          />
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
        </div>

        <div className="a-actions ie-save">
          <button className="a-btn" type="submit">
            {t('ie.save')}
          </button>
        </div>
      </form>

      {itinerary ? (
        <div className="a-card">
          <h2>{t('ie.status_t')}</h2>
          <p className="a-hint">{t('ie.status_hint')}</p>
          <p>
            <Pill tone={statusTone}>{t(`ie.status_${status}`)}</Pill>{' '}
            <span className="a-muted">
              v{itinerary.version} · {t('ip1.pdf_ar_status')}:{' '}
            </span>
            <PdfStatusPill status={statusByLocale.ar ?? { kind: 'none' }} t={t} />
          </p>
          {block === 'no_pdf' ? <p className="a-hint">{t('ip1.publish_blocked_pdf')}</p> : null}
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            {mayPublish ? (
              <>
                <form className="a-inline-form" action={publishItinerary.bind(null, itinerary.id)}>
                  <button className="a-btn accent" type="submit" disabled={block === 'no_pdf'}>
                    {t('itineraries.publish_version', { version: itinerary.version + 1 })}
                  </button>
                </form>
                {status === 'published' ? (
                  <form
                    className="a-inline-form"
                    action={setItineraryVisibility.bind(null, itinerary.id)}
                  >
                    <input type="hidden" name="visibility" value="hidden" />
                    <button className="a-btn ghost" type="submit">
                      {t('ie.hide')}
                    </button>
                  </form>
                ) : null}
                {status === 'hidden' ? (
                  <form
                    className="a-inline-form"
                    action={setItineraryVisibility.bind(null, itinerary.id)}
                  >
                    <input type="hidden" name="visibility" value="published" />
                    <button className="a-btn ghost" type="submit">
                      {t('ie.show')}
                    </button>
                  </form>
                ) : null}
                {status !== 'draft' ? (
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
            <form className="a-inline-form" action={duplicateItinerary.bind(null, itinerary.id)}>
              <button className="a-btn ghost" type="submit">
                {t('ie.duplicate')}
              </button>
            </form>
            <form className="a-inline-form" action={deleteItinerary.bind(null, itinerary.id)}>
              {buyerCount > 0 ? (
                <span className="a-hint">{t('ie.delete_blocked', { count: buyerCount })}</span>
              ) : (
                <ConfirmSubmit
                  className="a-btn danger"
                  label={t('ie.delete')}
                  title={t('ie.delete_title')}
                />
              )}
            </form>
          </div>
        </div>
      ) : null}
    </>
  )

  const renderTab = async () => {
    if (!itinerary) return basicsTab
    switch (tab) {
      case 'content': {
        const defaults = await contentDefaults(
          Math.max(days.length, itinerary.days),
          itinerary.includesMap ||
            (itinerary.previewStats ?? []).some((s) => s.icon === 'map' || s.icon === 'pin'),
        )
        return (
          <>
            <AreasCard
              action={saveItineraryAreas.bind(null, itinerary.id)}
              areas={normaliseAreas(itinerary.areas)}
              choices={await areaChoices()}
              t={t}
            />
            <PageContentEditor
              initial={normalisePageContent(itinerary.pageContent)}
              defaults={defaults}
              action={savePageContent.bind(null, itinerary.id)}
            />
            <p className="a-hint ie-note">{t('ie.teasers_note')}</p>
            <DayTeasersCard
              itineraryId={itinerary.id}
              days={days}
              teaserDaysVisible={itinerary.teaserDaysVisible}
              mediaList={mediaList}
              t={t}
            />
            <PreviewCard itinerary={itinerary} mediaList={mediaList} t={t} withFaq={false} />
          </>
        )
      }
      case 'faq':
        return (
          <form className="a-form" action={saveItineraryFaq.bind(null, itinerary.id)}>
            <div className="a-card">
              <h2>{t('ie.tab_faq')}</h2>
              <p className="a-hint">{t('ie.faq_hint')}</p>
              <FaqRepeater entries={(itinerary.faq ?? []) as unknown as FaqRepeaterEntry[]} />
            </div>
            <div className="a-actions ie-save">
              <button className="a-btn" type="submit">
                {t('ie.save')}
              </button>
            </div>
          </form>
        )
      case 'days':
        return (
          <>
            <div className="a-card ie-private">
              <h2>{t('ie.days_private_t')}</h2>
              <p>{t('ie.days_private_b')}</p>
            </div>
            <DayPlan
              itineraryId={itinerary.id}
              days={days}
              activities={activities}
              stopsByDay={stopsByDay}
              placeChoices={placeChoices}
            />
          </>
        )
      case 'pricing':
        return (
          <>
            <form className="a-form" action={saveItinerary.bind(null, itinerary.id)}>
              {sectionsInput('pricing')}
              <div className="a-card">
                <h2>{t('itineraries.section_commercial')}</h2>
                <p className="a-hint">{t('ie.pricing_hint')}</p>
                {pricesLocked && <PriceLockNote />}
                <div className="a-row">
                  <MoneyField
                    minor={itinerary.priceMinor}
                    currency={itinerary.currency}
                    locked={pricesLocked}
                  />
                </div>
                <h3>{t('itineraries.tiers_t')}</h3>
                <p className="a-hint">{t('itineraries.tiers_hint')}</p>
                <div className="a-row">
                  {ITINERARY_TIERS.map((key) => {
                    const minor = normaliseTierPrices(itinerary.tierPrices)[key]
                    return (
                      <Field key={key} label={t(`itineraries.tier_${key}`)} htmlFor={`tier_${key}`}>
                        <TextInput
                          id={`tier_${key}`}
                          name={`tier_${key}`}
                          inputMode="decimal"
                          dir="ltr"
                          defaultValue={
                            minor === undefined ? '' : formatMoneyInput(minor, itinerary.currency)
                          }
                          {...priceInputProps(pricesLocked)}
                        />
                      </Field>
                    )
                  })}
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
                    defaultValue={itinerary.vipPlanId ?? ''}
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
              </div>

              <div className="a-card">
                <h2>{t('p3.section_sale')}</h2>
                <p className="a-hint">{t('p3.sale_hint')}</p>
                <div className="a-row">
                  <Checkbox
                    name="saleDigital"
                    label={t('p3.sale_digital')}
                    defaultChecked={itinerary.saleDigital}
                    hint={t('p3.sale_digital_hint')}
                  />
                  <Checkbox
                    name="saleWithActivities"
                    label={t('p3.sale_activities')}
                    defaultChecked={itinerary.saleWithActivities}
                    hint={t('p3.sale_activities_hint')}
                  />
                  <Checkbox
                    name="saleWithPackages"
                    label={t('p3.sale_packages')}
                    defaultChecked={itinerary.saleWithPackages}
                    hint={t('p3.sale_packages_hint')}
                  />
                  <Checkbox
                    name="saleCustomRequest"
                    label={t('p3.sale_custom')}
                    defaultChecked={itinerary.saleCustomRequest}
                    hint={t('p3.sale_custom_hint')}
                  />
                </div>
              </div>
              <div className="a-actions ie-save">
                <button className="a-btn" type="submit">
                  {t('ie.save')}
                </button>
              </div>
            </form>

            <BuyerPageCard
              itinerary={itinerary}
              globalPct={sales.allActivitiesDiscountPct}
              locale={uiLocale}
              t={t}
            />

            <div className="a-card">
              <h2>{t('p3.section_packages')}</h2>
              <p className="a-hint">{t('p3.packages_hint')}</p>
              {!itinerary.saleWithPackages ? (
                <p className="a-hint">{t('p3.packages_off')}</p>
              ) : null}
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
                          <ConfirmSubmit
                            className="a-btn danger small"
                            formAction={removeItineraryPackageLink.bind(
                              null,
                              itinerary.id,
                              link.packageId,
                            )}
                            label={t('common.remove')}
                            title={t('confirm.remove_title')}
                          />
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
            </div>
          </>
        )
      case 'pdf': {
        const generated = pdfDocs
          .filter((doc) => doc.source === 'generated' && doc.version === itinerary.version)
          .map((doc) => ({ locale: doc.locale, objectKey: doc.objectKey }))
        const docHref = (docId: string) =>
          `${adminHref(`/itineraries/${itinerary.id}/pdf`)}?doc=${docId}`
        return (
          <>
            <div className="a-card ie-explain">
              <h2>{t('ie.pdf_explain_t')}</h2>
              <p>{t('ie.pdf_explain_b')}</p>
              <h3>{t('ie.pdf_sent_t')}</h3>
              <ul className="ie-sent" data-testid="ie-sent">
                {locales.map((locale) => {
                  const sent = deliveredPdf({
                    locale,
                    uploadedKeys: itinerary.uploadedPdfKeys,
                    generated,
                    fallbackLocale: defaultLocale,
                  })
                  const doc =
                    sent.kind === 'none'
                      ? undefined
                      : pdfDocs.find((one) => one.objectKey === sent.objectKey)
                  const lang = localeConfig[locale].label
                  const fbLang =
                    sent.kind === 'none'
                      ? ''
                      : (localeConfig[sent.locale as keyof typeof localeConfig]?.label ??
                        sent.locale)
                  const label =
                    sent.kind === 'uploaded'
                      ? sent.locale === locale
                        ? t('ie.pdf_sent_uploaded', { version: doc?.fileVersion ?? 1 })
                        : t('ie.pdf_sent_uploaded_fb', { lang: fbLang })
                      : sent.kind === 'generated'
                        ? sent.locale === locale
                          ? t('ie.pdf_sent_generated')
                          : t('ie.pdf_sent_generated_fb', { lang: fbLang })
                        : t('ie.pdf_sent_none')
                  return (
                    <li key={locale}>
                      <b>{lang}</b>
                      <Pill
                        tone={
                          sent.kind === 'uploaded'
                            ? 'good'
                            : sent.kind === 'generated'
                              ? 'info'
                              : 'warn'
                        }
                      >
                        {label}
                      </Pill>
                      {doc ? (
                        <a
                          className="a-btn ghost small"
                          href={docHref(doc.id)}
                          target="_blank"
                          rel="noopener"
                        >
                          {t('ie.pdf_open')}
                        </a>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
            <div className="a-card">
              <h2>{t('itineraries.pdf_upload')}</h2>
              <PdfDropzone
                uploadUrl={adminHref(`/itineraries/${itinerary.id}/pdf`)}
                tabUrl={editorHref('pdf')}
                maxMb={sales.maxUploadMb}
              />
            </div>
            <PdfCard
              itinerary={itinerary}
              docs={pdfDocs}
              statusByLocale={statusByLocale}
              maxUploadMb={sales.maxUploadMb}
              t={t}
              uiLocale={uiLocale}
              withUploadForm={false}
              docHref={docHref}
            />
          </>
        )
      }
      case 'preview':
        return (
          <div className="a-card">
            <h2>{t('ie.preview_t')}</h2>
            <p className="a-hint">{t('ie.preview_hint')}</p>
            <h3>{t('ie.preview_public')}</h3>
            <p className="a-actions">
              {locales.map((locale) => (
                <a
                  key={locale}
                  className="a-btn ghost"
                  href={`/${locale}/itineraries/${itinerary.slug}`}
                  target="_blank"
                  rel="noopener"
                >
                  {localeConfig[locale].label}
                </a>
              ))}
            </p>
            <h3>{t('ie.preview_buyer')}</h3>
            <p className="a-hint">{t('ie.preview_buyer_hint')}</p>
            <p className="a-actions">
              {locales.map((locale) => (
                <a
                  key={locale}
                  className="a-btn ghost"
                  href={`/${locale}/account/itineraries/${itinerary.slug}/activities`}
                  target="_blank"
                  rel="noopener"
                >
                  {localeConfig[locale].label}
                </a>
              ))}
            </p>
          </div>
        )
      default:
        return basicsTab
    }
  }

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
            {itinerary ? <Pill tone={statusTone}>{t(`ie.status_${status}`)}</Pill> : null}
            {itinerary ? (
              <a
                className="a-btn ghost"
                href={`/ar/itineraries/${itinerary.slug}`}
                target="_blank"
                rel="noopener"
              >
                {t('ie.view')}
              </a>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/itineraries')}>
              {t('itineraries.back_to_list')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />
      <EditorShell tabs={tabs} current={tab}>
        {await renderTab()}
      </EditorShell>
    </>
  )
}
