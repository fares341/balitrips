import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { mapViewSettings } from '@/app/[locale]/map/map-style'
import { db } from '@/db'
import { mapPlaces, placeTags, tags } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import {
  activityOptions,
  categoryOptions,
  mediaOptions,
  regionOptions,
} from '../../../_lib/lookups'
import { param } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'
import { readSetting } from '../../../_lib/settings'
import { CoordPicker } from '../../../_ui/coord-picker'
import { Advanced } from '../../../_ui/advanced'
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
import { baliInputValue } from '../../../_lib/bali-time'
import { PageHead } from '../../../_ui/shell'
import { deletePlace, savePlace, uploadPlaceVideo } from '../actions'
import { VisitorPreview } from './preview'

export const dynamic = 'force-dynamic'

export default async function PlaceEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const session = await requireCapability('content.write')
  const { t, locale } = await getAdminI18n()
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

  const [regions, activities, mediaList, categoryList, tagList, placeTagRows, mapSettings, all] =
    await Promise.all([
      regionOptions(),
      activityOptions(),
      mediaOptions(),
      categoryOptions(),
      db.select().from(tags).orderBy(asc(tags.sortOrder), asc(tags.key)),
      place
        ? db
            .select({ tagId: placeTags.tagId })
            .from(placeTags)
            .where(eq(placeTags.placeId, place.id))
        : [],
      readSetting('map'),
      // every other place, for the "possible duplicate within 50 m" check
      db
        .select({
          id: mapPlaces.id,
          slug: mapPlaces.slug,
          name: mapPlaces.name,
          lat: mapPlaces.lat,
          lon: mapPlaces.lon,
        })
        .from(mapPlaces)
        .where(isNull(mapPlaces.deletedAt)),
    ])
  const chosenTags = new Set(placeTagRows.map((row) => row.tagId))
  const others = all
    .filter((row) => row.id !== place?.id)
    .map((row) => ({
      id: row.id,
      name: pick(row.name, locale, row.slug),
      lat: row.lat,
      lon: row.lon,
      href: adminHref(`/places/${row.id}`),
    }))
  // After a save: straight to the place as visitors will see it.
  const justSaved = place !== null && param(query, 'ok') !== null
  const site = locale === 'ar' ? 'ar' : 'en'
  const live = place !== null && place.status === 'published' && !place.isHidden

  return (
    <>
      <PageHead
        title={place ? pick(place.name, 'en', place.slug) : t('places.new_title')}
        description={t('places.editor_description')}
        actions={
          <>
            {place ? (
              <Link className="a-btn ghost" href={adminHref(`/map?focus=${place.id}`)}>
                {t('places.on_map')}
              </Link>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/places')}>
              {t('places.back')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />
      {justSaved && place ? (
        <div className="a-card a-saved-links" role="status">
          {live ? (
            <>
              <span>{t('places.saved_live')}</span>
              <a
                className="a-btn"
                href={`/${site}/map?place=${encodeURIComponent(place.slug)}`}
                target="_blank"
                rel="noopener"
              >
                {t('places.saved_on_map')}
              </a>
              <a
                className="a-btn ghost"
                href={`/${site}/places/${encodeURIComponent(place.slug)}`}
                target="_blank"
                rel="noopener"
              >
                {t('places.saved_page')}
              </a>
            </>
          ) : (
            <span>
              {place.status !== 'published' ? t('places.warn_draft') : t('places.warn_hidden')}
            </span>
          )}
        </div>
      ) : null}
      {place ? <VisitorPreview place={place} t={t} /> : null}

      <form className="a-form" action={savePlace.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('places.identity')}</h2>
          <div className="a-row">
            <Field label={`${t('common.slug')} *`} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={place?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', place?.legacyId ?? '']]}
            >
              <Field label={t('places.legacy_id')} htmlFor="legacyId">
                <TextInput id="legacyId" name="legacyId" defaultValue={place?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <StatusField value={place?.status} />
          </div>
        </div>

        <div className="a-card">
          <h2>{t('places.copy')}</h2>
          <LocalizedField name="name" label={t('common.name')} value={place?.name} required />
          <LocalizedField name="category" label={t('places.category')} value={place?.category} />
          <LocalizedField
            name="description"
            label={t('places.description_field')}
            value={place?.description}
            rows={5}
          />
          <LocalizedField
            name="detailedDescription"
            label={t('places.detailed_description')}
            value={place?.detailedDescription}
            rows={8}
          />
        </div>

        <div className="a-card">
          <h2>{t('places.access')}</h2>
          <div className="a-row">
            <Checkbox
              name="isFree"
              label={t('places.free_to_view')}
              defaultChecked={place?.isFree ?? false}
              hint={t('places.free_to_view_hint')}
            />
            {/* Two levels (client, Oct 2026): every locked place needs the VIP subscription. */}
            <input type="hidden" name="requiredEntitlement" value="map_access" />
          </div>
          <div className="a-row">
            <Checkbox
              name="isHiddenGem"
              label={t('places.hidden_gem')}
              defaultChecked={place?.isHiddenGem ?? false}
              hint={t('places.hidden_gem_hint')}
            />
            <Checkbox
              name="isHidden"
              label={t('places.hide')}
              defaultChecked={place?.isHidden ?? false}
              hint={t('places.hide_hint')}
            />
            <Checkbox
              name="canFavorite"
              label={t('places.can_favorite')}
              defaultChecked={place?.canFavorite ?? true}
            />
            <Checkbox
              name="canAddToTrip"
              label={t('places.can_add_to_trip')}
              defaultChecked={place?.canAddToTrip ?? true}
            />
          </div>
          <div className="a-row">
            <Field
              label={t('places.search_priority')}
              htmlFor="priority"
              hint={t('places.search_priority_hint')}
            >
              <TextInput
                id="priority"
                name="priority"
                inputMode="numeric"
                defaultValue={String(place?.priority ?? 0)}
              />
            </Field>
            <Field
              label={t('places.sort_order')}
              htmlFor="sortOrder"
              hint={t('places.sort_order_hint')}
            >
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
          <h2>{t('places.location')}</h2>
          <CoordPicker
            lat={place ? String(place.lat) : ''}
            lon={place ? String(place.lon) : ''}
            settings={mapViewSettings(mapSettings)}
            others={others}
          />
          <div className="a-row">
            <Field label={t('places.opening_hours')} htmlFor="openingHours">
              <TextInput
                id="openingHours"
                name="openingHours"
                defaultValue={place?.openingHours ?? ''}
                maxLength={64}
              />
            </Field>
            <Field
              label={t('places.rating_tenths')}
              htmlFor="ratingTenths"
              hint={t('places.rating_tenths_hint')}
            >
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
            <OptionField
              name="regionId"
              label={t('places.region')}
              options={regions}
              value={place?.regionId}
            />
            <OptionField
              name="activityId"
              label={t('places.linked_activity')}
              options={activities}
              value={place?.activityId}
            />
            <OptionField
              name="heroImageId"
              label={t('places.hero_image')}
              options={mediaList}
              value={place?.heroImageId}
            />
          </div>
          <div className="a-row">
            <OptionField
              name="categoryId"
              label={t('places.category_filters')}
              options={categoryList}
              value={place?.categoryId}
            />
          </div>
          <div className="a-row">
            <Field
              label={t('places.event_starts')}
              htmlFor="eventStartsAt"
              hint={t('places.event_starts_hint')}
            >
              <TextInput
                id="eventStartsAt"
                name="eventStartsAt"
                type="datetime-local"
                defaultValue={baliInputValue(place?.eventStartsAt)}
              />
            </Field>
            <Field
              label={t('places.event_ends')}
              htmlFor="eventEndsAt"
              hint={t('places.event_ends_hint')}
            >
              <TextInput
                id="eventEndsAt"
                name="eventEndsAt"
                type="datetime-local"
                defaultValue={baliInputValue(place?.eventEndsAt)}
              />
            </Field>
          </div>
          <div className="a-field">
            <label>{t('places.tags')}</label>
            <div className="a-row" style={{ gap: 12 }}>
              {tagList.length === 0 ? (
                <span className="a-hint">
                  {t('places.no_tags')}{' '}
                  <Link href={adminHref('/taxonomy')}>{t('places.taxonomy_link')}</Link>.
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
                    {tag.status !== 'active' ? t('places.inactive_suffix') : ''}
                  </label>
                ))
              )}
            </div>
          </div>
          <OptionChecklist
            name="subCategoryIds"
            label={t('places.sub_categories')}
            options={categoryList}
            values={place?.subCategoryIds ?? []}
            hint={t('places.sub_categories_hint')}
          />
          <OptionChecklist
            name="galleryImageIds"
            label={t('places.gallery')}
            options={mediaList}
            values={place?.galleryImageIds ?? []}
            hint={t('places.gallery_hint')}
          />
          <Field label={t('places.videos')} htmlFor="videos" hint={t('places.videos_hint')}>
            <TextArea
              id="videos"
              name="videos"
              rows={3}
              defaultValue={(place?.videos ?? []).join('\n')}
            />
          </Field>
          <Field
            label={t('places.internal_notes')}
            htmlFor="internalNotes"
            hint={t('places.internal_notes_hint')}
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
            {t('places.save')}
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
            <h2 style={{ width: '100%', margin: 0 }}>{t('places.upload_video_heading')}</h2>
            <Field label={t('places.video_file')} htmlFor="video-file">
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
                {t('places.upload_video_btn')}
              </button>
            </div>
          </form>
          <form className="a-card" action={deletePlace.bind(null, place.id)}>
            <h2>{t('places.archive')}</h2>
            <div className="a-actions" style={{ marginBlockStart: 12 }}>
              <button className="a-btn danger" type="submit">
                {t('places.archive_btn')}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  )
}
