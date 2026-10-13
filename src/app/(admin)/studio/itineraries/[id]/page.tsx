import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { itineraries, itineraryDays, itineraryRegions } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'
import { locales, localeConfig } from '@/i18n/config'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, placeOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { Pill } from '../../../_ui/table'
import {
  deleteItinerary,
  publishItinerary,
  removeItineraryPdf,
  saveItinerary,
  unpublishItinerary,
  uploadItineraryPdf,
} from '../actions'
import { getAdminI18n } from '../../../_lib/i18n'
import { DayPlan } from './day-plan'

export const dynamic = 'force-dynamic'

export default async function ItineraryEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
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
            <Field label={t('itineraries.legacy_id')} htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={itinerary?.legacyId ?? ''} />
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
          <h2>{t('itineraries.section_access')}</h2>
          <div className="a-row">
            <Checkbox
              name="includesMap"
              label={t('itineraries.f_includes_map')}
              defaultChecked={itinerary?.includesMap ?? false}
              hint={t('itineraries.f_includes_map_hint')}
            />
            <Checkbox
              name="isVip"
              label={t('itineraries.f_vip')}
              defaultChecked={itinerary?.isVip ?? false}
              hint={t('itineraries.f_vip_hint')}
            />
          </div>
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
            <MoneyField minor={itinerary?.priceMinor} currency={itinerary?.currency} />
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

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('itineraries.save')}
          </button>
        </div>
      </form>

      {itinerary ? (
        <>
          <DayPlan itineraryId={itinerary.id} days={days} activities={activities} />

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
