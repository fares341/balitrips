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

  const title = itinerary ? pick(itinerary.name, 'en', itinerary.slug) : 'New itinerary'
  const mayPublish = can(session.role, 'content.publish')

  return (
    <>
      <PageHead
        title={title}
        description={
          itinerary
            ? `Version ${itinerary.version} · ${days.length} authored day${days.length === 1 ? '' : 's'} · /itineraries/${itinerary.slug}`
            : 'Save the itinerary first, then build its day plan.'
        }
        actions={
          <>
            {itinerary ? (
              <Pill tone={itinerary.status === 'published' ? 'good' : 'neutral'}>
                {itinerary.status}
              </Pill>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/itineraries')}>
              Back to list
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveItinerary.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug" hint="Permanent public URL.">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={itinerary?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Legacy id" htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={itinerary?.legacyId ?? ''} />
            </Field>
            <Field
              label="Spots"
              htmlFor="spots"
              hint="Number of stops shown on the card. Blank hides it."
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
          <p className="a-hint">
            Length is derived from the day plan below and is not editable here — a stored length
            that disagrees with the authored days is what produced the filler cards.
          </p>
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField name="name" label="Name" value={itinerary?.name} required />
          <LocalizedField name="tripType" label="Trip type" value={itinerary?.tripType} />
          <LocalizedField name="blurb" label="Blurb" value={itinerary?.blurb} rows={4} />
          <LocalizedListField
            name="audience"
            label="Who it suits"
            values={itinerary?.audience}
            hint="One audience per line."
          />
          <LocalizedField
            name="detailedDescription"
            label="Detailed description"
            value={itinerary?.detailedDescription}
            rows={6}
          />
        </div>

        <div className="a-card">
          <h2>Access & internal</h2>
          <div className="a-row">
            <Checkbox
              name="includesMap"
              label="Includes the map"
              defaultChecked={itinerary?.includesMap ?? false}
              hint="Buying this itinerary unlocks the interactive map (lifetime)."
            />
            <Checkbox
              name="isVip"
              label="VIP itinerary"
              defaultChecked={itinerary?.isVip ?? false}
              hint="With “Includes the map”, grants VIP map access (Hidden Gems)."
            />
          </div>
          <Field label="Internal notes" htmlFor="internalNotes" hint="Never shown to customers.">
            <TextArea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              defaultValue={itinerary?.internalNotes ?? ''}
            />
          </Field>
          <OptionChecklist
            name="galleryImageIds"
            label="Gallery images"
            options={mediaList}
            values={itinerary?.galleryImageIds ?? []}
          />
          <OptionChecklist
            name="linkedPlaceIds"
            label="Linked map places"
            options={places}
            values={itinerary?.linkedPlaceIds ?? []}
          />
        </div>

        <div className="a-card">
          <h2>Commercial</h2>
          <div className="a-row">
            <MoneyField minor={itinerary?.priceMinor} currency={itinerary?.currency} />
            <OptionField
              name="heroImageId"
              label="Hero image"
              options={mediaList}
              value={itinerary?.heroImageId}
            />
          </div>
          <OptionChecklist
            name="regionIds"
            label="Regions covered"
            options={regions}
            values={selectedRegions.map((row) => row.regionId)}
          />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save itinerary
          </button>
        </div>
      </form>

      {itinerary ? (
        <>
          <DayPlan itineraryId={itinerary.id} days={days} activities={activities} />

          <div className="a-card">
            <h2>Publishing</h2>
            <p className="a-hint">
              Publishing bumps the version from v{itinerary.version} to v{itinerary.version + 1}.
              Orders pin the version they bought, so a customer who purchased an earlier plan keeps
              downloading the plan they paid for. Unpublishing leaves the version alone.
            </p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              {mayPublish ? (
                <>
                  <form
                    className="a-inline-form"
                    action={publishItinerary.bind(null, itinerary.id)}
                  >
                    <button className="a-btn accent" type="submit">
                      Publish v{itinerary.version + 1}
                    </button>
                  </form>
                  {itinerary.status === 'published' ? (
                    <form
                      className="a-inline-form"
                      action={unpublishItinerary.bind(null, itinerary.id)}
                    >
                      <button className="a-btn ghost" type="submit">
                        Move to draft
                      </button>
                    </form>
                  ) : null}
                </>
              ) : (
                <span className="a-hint">Your role cannot publish.</span>
              )}
            </div>
          </div>

          <div className="a-card">
            <h2>PDF file</h2>
            <p className="a-hint">
              Upload a ready-made PDF per language. It replaces the automatically generated PDF for
              every customer who bought this itinerary, with the same watermark, viewer and download
              rules. Remove it to go back to the generated file.
            </p>
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
                      <strong>uploaded</strong>{' '}
                      <button className="a-btn ghost small" type="submit">
                        Remove
                      </button>
                    </form>
                  ) : (
                    <span className="a-muted">generated automatically</span>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="a-row"
              action={uploadItineraryPdf.bind(null, itinerary.id)}
              style={{ marginBlockStart: 12 }}
            >
              <Field label="Language" htmlFor="pdf-locale">
                <select className="a-select" id="pdf-locale" name="locale" defaultValue="ar">
                  {locales.map((locale) => (
                    <option key={locale} value={locale}>
                      {localeConfig[locale].label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="PDF (max 30 MB)" htmlFor="pdf-file">
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
                  Upload PDF
                </button>
              </div>
            </form>
          </div>

          <form className="a-card" action={deleteItinerary.bind(null, itinerary.id)}>
            <h2>Archive</h2>
            <p className="a-hint">
              Soft delete. Historical orders keep their line snapshots and their pinned version.
            </p>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn danger" type="submit">
                Archive itinerary
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  )
}
