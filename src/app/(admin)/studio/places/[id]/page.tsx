import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { mapPlaces, placeTags, tags } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import {
  activityOptions,
  categoryOptions,
  mediaOptions,
  regionOptions,
} from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import {
  Checkbox,
  Field,
  LocalizedField,
  Select,
  StatusField,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { deletePlace, savePlace, uploadPlaceVideo } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PlaceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const place = isNew
    ? null
    : ((
        await db
          .select()
          .from(mapPlaces)
          .where(and(eq(mapPlaces.id, id), isNull(mapPlaces.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !place) notFound()

  const [regions, activities, mediaList, categoryList, tagList, placeTagRows] = await Promise.all([
    regionOptions(),
    activityOptions(),
    mediaOptions(),
    categoryOptions(),
    db.select().from(tags).orderBy(asc(tags.sortOrder), asc(tags.key)),
    place
      ? db.select({ tagId: placeTags.tagId }).from(placeTags).where(eq(placeTags.placeId, place.id))
      : [],
  ])
  const chosenTags = new Set(placeTagRows.map((row) => row.tagId))

  return (
    <>
      <PageHead
        title={place ? pick(place.name, 'en', place.slug) : 'New map place'}
        description="Real coordinates are the only coordinate system. Card anchoring is derived from the projection, so a place can be added without hand-authoring pixel offsets."
        actions={
          <Link className="a-btn ghost" href={adminHref('/places')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={savePlace.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={place?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Legacy id" htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={place?.legacyId ?? ''} />
            </Field>
            <StatusField value={place?.status} />
          </div>
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField name="name" label="Name" value={place?.name} required />
          <LocalizedField name="category" label="Category" value={place?.category} />
          <LocalizedField
            name="description"
            label="Description"
            value={place?.description}
            rows={5}
          />
          <LocalizedField
            name="detailedDescription"
            label="Detailed description"
            value={place?.detailedDescription}
            rows={8}
          />
        </div>

        <div className="a-card">
          <h2>Access</h2>
          <div className="a-row">
            <Checkbox
              name="isFree"
              label="Free to view"
              defaultChecked={place?.isFree ?? false}
              hint="Free places are returned in full to everyone. Locked ones are redacted server-side: a marker and a count, never the name or coordinates."
            />
            <Field
              label="Required entitlement"
              htmlFor="requiredEntitlement"
              hint="Which purchase unlocks it. Ignored while the place is free."
            >
              <Select
                id="requiredEntitlement"
                name="requiredEntitlement"
                defaultValue={place?.requiredEntitlement ?? 'map_access'}
              >
                <option value="map_access">map_access</option>
                <option value="vip">vip</option>
              </Select>
            </Field>
          </div>
          <div className="a-row">
            <Checkbox
              name="isHiddenGem"
              label="Hidden Gem"
              defaultChecked={place?.isHiddenGem ?? false}
              hint="Hidden Gems are VIP-only, whatever the two fields above say."
            />
            <Checkbox
              name="isHidden"
              label="Hide from map and search"
              defaultChecked={place?.isHidden ?? false}
              hint="Stays published, but nobody sees it — e.g. temporarily closed."
            />
            <Checkbox
              name="canFavorite"
              label="Can be saved to favorites"
              defaultChecked={place?.canFavorite ?? true}
            />
            <Checkbox
              name="canAddToTrip"
              label="Can be added to My Trip"
              defaultChecked={place?.canAddToTrip ?? true}
            />
          </div>
          <div className="a-row">
            <Field
              label="Search priority"
              htmlFor="priority"
              hint="Higher shows first in search. 0 = normal."
            >
              <TextInput
                id="priority"
                name="priority"
                inputMode="numeric"
                defaultValue={String(place?.priority ?? 0)}
              />
            </Field>
            <Field label="Sort order" htmlFor="sortOrder" hint="Lower shows first on the map list.">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={String(place?.sortOrder ?? 0)}
              />
            </Field>
          </div>
        </div>

        <div className="a-card">
          <h2>Location and detail</h2>
          <div className="a-row">
            <Field label="Latitude *" htmlFor="lat" hint="Decimal degrees, -90 to 90.">
              <TextInput
                id="lat"
                name="lat"
                defaultValue={place ? String(place.lat) : ''}
                required
                inputMode="decimal"
              />
            </Field>
            <Field label="Longitude *" htmlFor="lon" hint="Decimal degrees, -180 to 180.">
              <TextInput
                id="lon"
                name="lon"
                defaultValue={place ? String(place.lon) : ''}
                required
                inputMode="decimal"
              />
            </Field>
            <Field label="Opening hours" htmlFor="openingHours">
              <TextInput
                id="openingHours"
                name="openingHours"
                defaultValue={place?.openingHours ?? ''}
                maxLength={64}
              />
            </Field>
            <Field label="Rating (tenths)" htmlFor="ratingTenths" hint="47 means 4.7.">
              <TextInput
                id="ratingTenths"
                name="ratingTenths"
                inputMode="numeric"
                defaultValue={
                  place?.rating === null || place?.rating === undefined
                    ? ''
                    : String(Math.round(place.rating * 10))
                }
              />
            </Field>
          </div>
          <div className="a-row">
            <OptionField name="regionId" label="Region" options={regions} value={place?.regionId} />
            <OptionField
              name="activityId"
              label="Linked activity"
              options={activities}
              value={place?.activityId}
            />
            <OptionField
              name="heroImageId"
              label="Hero image"
              options={mediaList}
              value={place?.heroImageId}
            />
          </div>
          <div className="a-row">
            <OptionField
              name="categoryId"
              label="Category (for filters)"
              options={categoryList}
              value={place?.categoryId}
            />
          </div>
          <div className="a-field">
            <label>Tags</label>
            <div className="a-row" style={{ gap: 12 }}>
              {tagList.length === 0 ? (
                <span className="a-hint">
                  No tags yet — add them in{' '}
                  <Link href={adminHref('/taxonomy')}>Categories &amp; regions</Link>.
                </span>
              ) : (
                tagList.map((tag) => (
                  <label key={tag.id} className="a-check">
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={tag.id}
                      defaultChecked={chosenTags.has(tag.id)}
                    />
                    {pick(tag.label, 'en', tag.key)}
                    {tag.status !== 'active' ? ' (inactive)' : ''}
                  </label>
                ))
              )}
            </div>
          </div>
          <OptionChecklist
            name="subCategoryIds"
            label="Sub-categories"
            options={categoryList}
            values={place?.subCategoryIds ?? []}
            hint="Extra categories this place also belongs to (filters and search)."
          />
          <OptionChecklist
            name="galleryImageIds"
            label="Gallery images"
            options={mediaList}
            values={place?.galleryImageIds ?? []}
            hint="Shown in the place panel after the hero image. Upload photos in the Media library."
          />
          <Field label="Videos" htmlFor="videos" hint="One URL per line (YouTube, Vimeo or .mp4).">
            <TextArea
              id="videos"
              name="videos"
              rows={3}
              defaultValue={(place?.videos ?? []).join('\n')}
            />
          </Field>
          <Field
            label="Internal notes"
            htmlFor="internalNotes"
            hint="Staff only. Never sent to the site."
          >
            <TextArea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              defaultValue={place?.internalNotes ?? ''}
            />
          </Field>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save place
          </button>
        </div>
      </form>

      {place ? (
        <>
          <form
            className="a-card a-row"
            action={uploadPlaceVideo.bind(null, place.id)}
            style={{ alignItems: 'end' }}
          >
            <h2 style={{ width: '100%', margin: 0 }}>Upload a video</h2>
            <Field label="MP4 or WebM, up to 24 MB" htmlFor="video-file">
              <input
                className="a-input"
                id="video-file"
                name="file"
                type="file"
                accept="video/mp4,video/webm"
                required
              />
            </Field>
            <div className="a-actions">
              <button className="a-btn accent" type="submit">
                Upload video
              </button>
            </div>
          </form>
          <form className="a-card" action={deletePlace.bind(null, place.id)}>
            <h2>Archive</h2>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn danger" type="submit">
                Archive place
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  )
}
