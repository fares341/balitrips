import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import {
  activities,
  activityAddonLinks,
  activityAddons,
  activityCategories,
  activityImages,
  activityTags,
  activityTiers,
  addonsLibrary,
  media,
  tags,
  tierIncludedActivities,
} from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { activityStatus, ACTIVITY_STATUSES } from '@/lib/content/activity-status'
import { pick } from '@/lib/content/localize'
import { mediaUrl } from '@/lib/content/queries'
import { formatMoney } from '@/lib/money'

import { adminHref } from '../../../_lib/admin-path'
import { baliInputValue } from '../../../_lib/bali-time'
import { activityOptions, categoryOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { param } from '../../../_lib/result'
import { Advanced } from '../../../_ui/advanced'
import {
  Checkbox,
  Field,
  LocalizedField,
  MoneyField,
  Select,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { FaqField } from '../../../_ui/faq-field'
import { Flash } from '../../../_ui/flash'
import { MarkdownEditor } from '../../../_ui/markdown-editor'
import { loadPickerMedia, MediaPicker } from '../../../_ui/media-picker'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { GalleryEditor, LocalizedRepeater, SortableList } from '../../../_ui/sortable'
import { Pill } from '../../../_ui/table'
import { getAdminI18n } from '../../../_lib/i18n'
import { AddonEditor } from './addon-editor'
import { AvailabilityTab } from './availability-tab'
import { ChildAgesCard, SeasonEditor } from './season-editor'
import { IncludedEditor } from './included-editor'
import { LibraryLinks } from './library-links'
import { TierEditor } from './tier-editor'
import { deleteActivity, reorderTiers, saveActivity } from '../actions'

export const dynamic = 'force-dynamic'

/** Must match FAQ_ROWS in ../actions.ts — the action reads exactly this many slots. */
const FAQ_ROWS = 12

const TABS = [
  'basics',
  'content',
  'media',
  'packages',
  'included',
  'addons',
  'booking',
  'availability',
  'faq',
] as const
type Tab = (typeof TABS)[number]

export default async function ActivityEditorPage({
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
  // Phase 6: without `prices.write` every price on this editor is read-only.
  const lockPrices = !can(session.role, 'prices.write')
  const requested = param(query, 'tab')
  const tab: Tab =
    !isNew && requested !== null && (TABS as readonly string[]).includes(requested)
      ? (requested as Tab)
      : 'basics'

  const activity = isNew
    ? null
    : ((
        await db
          .select()
          .from(activities)
          .where(and(eq(activities.id, id), isNull(activities.deletedAt)))
          .limit(1)
      )[0] ?? null)

  // A bad id is a 404, never a silent fallback to the first row — that is
  // exactly the handoff bug (`findActivity(id) || ACTIVITIES[0]`) that made
  // every wrong URL return 200 with someone else's content.
  if (!isNew && !activity) notFound()

  const title = activity ? pick(activity.name, locale, activity.slug) : t('activities.new')
  const tabHref = (key: Tab) =>
    adminHref(`/activities/${id}${key === 'basics' ? '' : `?tab=${key}`}`)
  const save = (section: string) => saveActivity.bind(null, isNew ? 'new' : id, section)
  const actions = (
    <div className="a-actions">
      <button className="a-btn" type="submit">
        {t('ae.save_section')}
      </button>
      {!can(session.role, 'content.publish') && tab === 'basics' ? (
        <span className="a-hint">{t('activities.cannot_publish')}</span>
      ) : null}
    </div>
  )

  return (
    <>
      <PageHead
        title={title}
        description={
          activity
            ? t('activities.edit_description', { path: `/activities/${activity.slug}` })
            : t('activities.new_description')
        }
        actions={
          <>
            {activity && activityStatus(activity.status) !== 'draft' ? (
              <a
                className="a-btn ghost"
                href={`/ar/activities/${activity.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('ae.view_page')}
              </a>
            ) : null}
            <Link className="a-btn ghost" href={adminHref('/activities')}>
              {t('activities.back_to_list')}
            </Link>
          </>
        }
      />
      <Flash searchParams={query} />

      <nav className="a-tabs" aria-label={t('ae.tabs_label')}>
        {TABS.map((key) =>
          isNew && key !== 'basics' ? (
            <span key={key} className="a-tab is-off" aria-disabled="true">
              {t(`ae.tab_${key}`)}
            </span>
          ) : (
            <Link
              key={key}
              className="a-tab"
              href={tabHref(key)}
              aria-current={tab === key ? 'page' : undefined}
            >
              {t(`ae.tab_${key}`)}
            </Link>
          ),
        )}
      </nav>
      {isNew ? <p className="a-hint">{t('ae.new_first')}</p> : null}

      {tab === 'basics' ? (
        <BasicsTab
          activity={activity}
          save={save('basics')}
          actions={actions}
          isAdmin={session.role === 'admin'}
          locked={lockPrices}
        />
      ) : null}

      {activity && tab === 'content' ? (
        <form className="a-form" action={save('content')}>
          <div className="a-card">
            <h2>{t('ae.tab_content')}</h2>
            <LocalizedField
              name="headline"
              label={t('ae.headline')}
              value={activity.headline}
              hint={t('ae.headline_hint')}
            />
            <LocalizedField
              name="shortDescription"
              label={t('ae.short_description')}
              value={activity.shortDescription}
              hint={t('ae.short_description_hint')}
              rows={2}
            />
            <MarkdownEditor
              name="description"
              label={t('ae.description')}
              value={activity.description}
            />
            <LocalizedRepeater
              name="highlights"
              label={t('ae.highlights')}
              values={activity.highlights}
            />
          </div>
          <div className="a-card">
            <h2>{t('activities.section_included')}</h2>
            <p className="a-hint">{t('ae.lists_hint')}</p>
            <LocalizedRepeater
              name="included"
              label={t('ae.included_list')}
              values={activity.included}
            />
            <LocalizedRepeater
              name="excluded"
              label={t('ae.excluded_list')}
              values={activity.excluded}
            />
            <LocalizedRepeater
              name="suitableFor"
              label={t('ae.suitable_for')}
              values={activity.suitableFor}
            />
            <LocalizedRepeater
              name="importantNotes"
              label={t('ae.important_notes')}
              values={activity.importantNotes}
            />
          </div>
          {actions}
        </form>
      ) : null}

      {activity && tab === 'media' ? (
        <MediaTab activity={activity} save={save('media')} actions={actions} />
      ) : null}

      {activity && tab === 'booking' ? (
        <form className="a-form" action={save('booking')}>
          <div className="a-card">
            <h2>{t('activities.section_booking')}</h2>
            <div className="a-row">
              <Field
                label={t('activities.f_lead_time')}
                htmlFor="leadTimeHours"
                hint={t('activities.f_lead_time_hint')}
              >
                <TextInput
                  id="leadTimeHours"
                  name="leadTimeHours"
                  inputMode="numeric"
                  defaultValue={String(activity.leadTimeHours)}
                />
              </Field>
              <Field label={t('ae.min_guests')} htmlFor="minGuests">
                <TextInput
                  id="minGuests"
                  name="minGuests"
                  inputMode="numeric"
                  defaultValue={String(activity.minGuests)}
                />
              </Field>
              <Field label={t('activities.max_guests')} htmlFor="maxGuests">
                <TextInput
                  id="maxGuests"
                  name="maxGuests"
                  inputMode="numeric"
                  defaultValue={String(activity.maxGuests)}
                />
              </Field>
            </div>
            <Field
              label={t('activities.f_time_slots')}
              htmlFor="timeSlots"
              hint={t('activities.f_time_slots_hint')}
            >
              <TextArea
                id="timeSlots"
                name="timeSlots"
                rows={4}
                dir="ltr"
                defaultValue={(activity.timeSlots ?? []).join('\n')}
              />
            </Field>
            <Checkbox
              name="multiDay"
              label={t('activities.f_multi_day')}
              defaultChecked={activity.multiDay}
              hint={t('activities.f_multi_day_hint')}
            />
            <div className="a-row">
              <Field
                label={t('activities.f_event_starts')}
                htmlFor="eventStartsAt"
                hint={t('activities.f_event_starts_hint')}
              >
                <TextInput
                  id="eventStartsAt"
                  name="eventStartsAt"
                  type="datetime-local"
                  defaultValue={baliInputValue(activity.eventStartsAt)}
                />
              </Field>
              <Field
                label={t('activities.f_event_ends')}
                htmlFor="eventEndsAt"
                hint={t('activities.f_event_ends_hint')}
              >
                <TextInput
                  id="eventEndsAt"
                  name="eventEndsAt"
                  type="datetime-local"
                  defaultValue={baliInputValue(activity.eventEndsAt)}
                />
              </Field>
            </div>
          </div>

          <div className="a-card">
            <h2>{t('ae.meeting')}</h2>
            <LocalizedField
              name="meetingPoint"
              label={t('ae.meeting_point')}
              value={activity.meetingPoint}
              rows={2}
            />
            <div className="a-row">
              <Field
                label={t('ae.meeting_lat')}
                htmlFor="meetingLat"
                hint={t('ae.meeting_coords_hint')}
              >
                <TextInput
                  id="meetingLat"
                  name="meetingLat"
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={activity.meetingLat === null ? '' : String(activity.meetingLat)}
                />
              </Field>
              <Field label={t('ae.meeting_lng')} htmlFor="meetingLng">
                <TextInput
                  id="meetingLng"
                  name="meetingLng"
                  inputMode="decimal"
                  dir="ltr"
                  defaultValue={activity.meetingLng === null ? '' : String(activity.meetingLng)}
                />
              </Field>
            </div>
            <Field
              label={t('ae.meeting_map_url')}
              htmlFor="meetingMapUrl"
              hint={t('ae.meeting_map_hint')}
            >
              <TextInput
                id="meetingMapUrl"
                name="meetingMapUrl"
                type="url"
                dir="ltr"
                defaultValue={activity.meetingMapUrl ?? ''}
              />
            </Field>
            <LocalizedField
              name="meetingTimeNote"
              label={t('ae.meeting_time')}
              value={activity.meetingTimeNote}
              hint={t('ae.meeting_time_hint')}
            />
            <LocalizedRepeater
              name="whatToBring"
              label={t('ae.what_to_bring')}
              values={activity.whatToBring}
            />
            <LocalizedRepeater
              name="ageConditions"
              label={t('ae.age_conditions')}
              values={activity.ageConditions}
            />
          </div>

          <div className="a-card">
            <h2>{t('ae.promises')}</h2>
            <Checkbox
              name="instantConfirmation"
              label={t('ae.instant')}
              defaultChecked={activity.instantConfirmation}
              hint={t('ae.instant_hint')}
            />
            <Field
              label={t('ae.free_cancel_hours')}
              htmlFor="freeCancellationHours"
              hint={t('ae.free_cancel_hint')}
            >
              <TextInput
                id="freeCancellationHours"
                name="freeCancellationHours"
                inputMode="numeric"
                defaultValue={
                  activity.freeCancellationHours === null
                    ? ''
                    : String(activity.freeCancellationHours)
                }
              />
            </Field>
            <LocalizedField
              name="cancellationPolicy"
              label={t('activities.f_cancellation')}
              value={activity.cancellationPolicy}
              rows={4}
              hint={t('activities.f_cancellation_hint')}
            />
          </div>
          {actions}
        </form>
      ) : null}

      {activity && tab === 'faq' ? (
        <form className="a-form" action={save('faq')}>
          <div className="a-card">
            <FaqField entries={activity.faq} maxRows={FAQ_ROWS} />
          </div>
          {actions}
        </form>
      ) : null}

      {activity && tab === 'packages' ? (
        <PackagesTab activity={activity} locked={lockPrices} />
      ) : null}
      {activity && tab === 'availability' ? (
        <AvailabilityTab
          activity={activity}
          monthParam={param(query, 'month')}
          role={session.role}
        />
      ) : null}
      {activity && tab === 'included' ? <IncludedTab activity={activity} /> : null}
      {activity && tab === 'addons' ? (
        <AddonsTab activity={activity} intl={intl} locked={lockPrices} />
      ) : null}

      {activity && tab === 'basics' ? (
        <form className="a-card" action={deleteActivity.bind(null, activity.id)}>
          <h2>{t('activities.section_archive')}</h2>
          <p className="a-hint">{t('activities.archive_hint')}</p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('activities.archive')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}

type ActivityRow = typeof activities.$inferSelect

// ---------------------------------------------------------------------------
// Basic details
// ---------------------------------------------------------------------------

async function BasicsTab({
  activity,
  save,
  actions,
  isAdmin,
  locked,
}: {
  activity: ActivityRow | null
  save: (form: FormData) => Promise<void>
  actions: ReactNode
  isAdmin: boolean
  locked: boolean
}) {
  const { t, locale } = await getAdminI18n()
  const [regions, categories, tagRows, selectedCategories, selectedTags] = await Promise.all([
    regionOptions(),
    categoryOptions(),
    db
      .select({ id: tags.id, key: tags.key, label: tags.label })
      .from(tags)
      .orderBy(asc(tags.sortOrder), asc(tags.key)),
    activity
      ? db
          .select({ categoryId: activityCategories.categoryId })
          .from(activityCategories)
          .where(eq(activityCategories.activityId, activity.id))
      : Promise.resolve([]),
    activity
      ? db
          .select({ tagId: activityTags.tagId })
          .from(activityTags)
          .where(eq(activityTags.activityId, activity.id))
      : Promise.resolve([]),
  ])
  const status = activityStatus(activity?.status)

  return (
    <form className="a-form" action={save}>
      <div className="a-card">
        <h2>{t('activities.section_identity')}</h2>
        <LocalizedField
          name="name"
          label={t('activities.f_name')}
          value={activity?.name}
          required
        />
        <div className="a-row">
          <Field
            label={t('activities.slug_required')}
            htmlFor="slug"
            hint={t('activities.slug_hint')}
          >
            <TextInput
              id="slug"
              name="slug"
              dir="ltr"
              defaultValue={activity?.slug ?? ''}
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
          <Field label={t('ae.status')} htmlFor="status" hint={t('ae.status_hint')}>
            <Select id="status" name="status" defaultValue={status}>
              {ACTIVITY_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`ae.status_${value}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <LocalizedField name="area" label={t('activities.f_area')} value={activity?.area} />
        <LocalizedField
          name="duration"
          label={t('activities.f_duration')}
          value={activity?.duration}
        />
        <div className="a-row">
          <OptionField
            name="regionId"
            label={t('activities.region')}
            options={regions}
            value={activity?.regionId}
          />
          <OptionField
            name="primaryCategoryId"
            label={t('ae.primary_category')}
            options={categories}
            value={activity?.primaryCategoryId}
            hint={t('ae.primary_category_hint')}
          />
        </div>
        <OptionChecklist
          name="categoryIds"
          label={t('ae.extra_categories')}
          options={categories}
          values={selectedCategories.map((row) => row.categoryId)}
        />
        <OptionChecklist
          name="tagIds"
          label={t('ae.tags')}
          options={tagRows.map((row) => ({
            value: row.id,
            label: pick(row.label, locale, row.key),
          }))}
          values={selectedTags.map((row) => row.tagId)}
          hint={t('ae.tags_hint')}
        />
      </div>

      <div className="a-card">
        <h2>{t('ae.flags')}</h2>
        <Checkbox
          name="isFeatured"
          label={t('ae.featured')}
          defaultChecked={activity?.isFeatured ?? false}
        />
        <Checkbox
          name="isMostPopular"
          label={t('ae.most_popular')}
          defaultChecked={activity?.isMostPopular ?? false}
        />
        <Checkbox
          name="showOnHome"
          label={t('ae.show_on_home')}
          defaultChecked={activity?.showOnHome ?? false}
          hint={t('ae.show_on_home_hint')}
        />
      </div>

      <div className="a-card">
        <h2>{t('ae.base_price')}</h2>
        <p className="a-hint">{t('ae.base_price_hint')}</p>
        <div className="a-row">
          <MoneyField minor={activity?.priceMinor} currency={activity?.currency} locked={locked} />
        </div>
        <Advanced
          show={isAdmin}
          title={t('common.advanced')}
          keep={[
            ['legacyId', activity?.legacyId ?? ''],
            [
              'ratingTenths',
              activity?.rating === null || activity?.rating === undefined
                ? ''
                : String(Math.round(activity.rating * 10)),
            ],
            ['reviewCount', String(activity?.reviewCount ?? 0)],
          ]}
        >
          <div className="a-row">
            <Field
              label={t('activities.legacy_id')}
              htmlFor="legacyId"
              hint={t('activities.legacy_id_hint')}
            >
              <TextInput id="legacyId" name="legacyId" defaultValue={activity?.legacyId ?? ''} />
            </Field>
            <Field
              label={t('activities.f_rating')}
              htmlFor="ratingTenths"
              hint={t('activities.f_rating_hint')}
            >
              <TextInput
                id="ratingTenths"
                name="ratingTenths"
                inputMode="numeric"
                defaultValue={
                  activity?.rating === null || activity?.rating === undefined
                    ? ''
                    : String(Math.round(activity.rating * 10))
                }
              />
            </Field>
            <Field label={t('activities.f_review_count')} htmlFor="reviewCount">
              <TextInput
                id="reviewCount"
                name="reviewCount"
                inputMode="numeric"
                defaultValue={String(activity?.reviewCount ?? 0)}
              />
            </Field>
          </div>
        </Advanced>
      </div>
      {actions}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Photos & video
// ---------------------------------------------------------------------------

async function MediaTab({
  activity,
  save,
  actions,
}: {
  activity: ActivityRow
  save: (form: FormData) => Promise<void>
  actions: ReactNode
}) {
  const { t, locale } = await getAdminI18n()
  const [mediaList, gallery] = await Promise.all([
    loadPickerMedia(),
    db
      .select({ id: media.id, objectKey: media.objectKey, alt: media.alt })
      .from(activityImages)
      .innerJoin(media, eq(media.id, activityImages.mediaId))
      .where(and(eq(activityImages.activityId, activity.id), isNull(media.deletedAt)))
      .orderBy(asc(activityImages.sortOrder)),
  ])
  const label = (row: { objectKey: string; alt: Parameters<typeof pick>[0] }) =>
    pick(row.alt, locale, row.objectKey.split('/').pop() ?? row.objectKey)

  return (
    <form className="a-form" action={save}>
      <div className="a-card">
        <h2>{t('ae.tab_media')}</h2>
        <MediaPicker
          name="heroImageId"
          label={t('ae.hero')}
          items={mediaList}
          value={activity.heroImageId}
          hint={t('activities.hero_image_hint')}
        />
        <MediaPicker
          name="mobileHeroImageId"
          label={t('ae.mobile_hero')}
          items={mediaList}
          value={activity.mobileHeroImageId}
          hint={t('ae.mobile_hero_hint')}
        />
        <GalleryEditor
          name="galleryIds"
          label={t('ae.gallery')}
          hint={t('ae.gallery_hint')}
          initial={gallery.map((row) => ({
            id: row.id,
            url: mediaUrl(row.objectKey),
            label: label(row),
          }))}
          library={mediaList.map((row) => ({
            id: row.id,
            url: mediaUrl(row.objectKey),
            label: label(row),
          }))}
        />
        <Field label={t('ae.video')} htmlFor="videoUrl" hint={t('ae.video_hint')}>
          <TextInput
            id="videoUrl"
            name="videoUrl"
            type="url"
            dir="ltr"
            placeholder="https://www.youtube.com/watch?v=…"
            defaultValue={activity.videoUrl ?? ''}
          />
        </Field>
      </div>
      {actions}
    </form>
  )
}

// ---------------------------------------------------------------------------
// Packages
// ---------------------------------------------------------------------------

async function loadTiers(activityId: string) {
  return db
    .select()
    .from(activityTiers)
    .where(and(eq(activityTiers.activityId, activityId), isNull(activityTiers.deletedAt)))
    .orderBy(asc(activityTiers.sortOrder), asc(activityTiers.priceMinor))
}

async function addonOptions(activityId: string, locale: Parameters<typeof pick>[1]) {
  const [own, linked] = await Promise.all([
    db
      .select()
      .from(activityAddons)
      .where(and(eq(activityAddons.activityId, activityId), isNull(activityAddons.deletedAt)))
      .orderBy(asc(activityAddons.sortOrder), asc(activityAddons.createdAt)),
    db
      .select({ id: addonsLibrary.id, name: addonsLibrary.name })
      .from(activityAddonLinks)
      .innerJoin(addonsLibrary, eq(addonsLibrary.id, activityAddonLinks.addonId))
      .where(and(eq(activityAddonLinks.activityId, activityId), isNull(addonsLibrary.deletedAt)))
      .orderBy(asc(activityAddonLinks.sortOrder)),
  ])
  return {
    own,
    options: [
      ...own.map((addon) => ({ value: addon.id, label: pick(addon.name, locale) })),
      ...linked.map((addon) => ({ value: addon.id, label: pick(addon.name, locale) })),
    ],
  }
}

async function PackagesTab({ activity, locked }: { activity: ActivityRow; locked: boolean }) {
  const { t, locale, intl } = await getAdminI18n()
  const [tiers, addons] = await Promise.all([
    loadTiers(activity.id),
    addonOptions(activity.id, locale),
  ])
  return (
    <>
      <ChildAgesCard activity={activity} />
      {tiers.length > 1 ? (
        <div className="a-card">
          <h2>{t('ae.tiers_order')}</h2>
          <SortableList
            hint={t('ae.tiers_order_hint')}
            onSave={reorderTiers.bind(null, activity.id)}
            rows={tiers.map((tier) => ({
              id: tier.id,
              label: pick(tier.name, locale, tier.key),
              content: (
                <span className="a-sort-line">
                  <b>{pick(tier.name, locale, tier.key)}</b>
                  <span className="a-muted" dir="ltr">
                    {formatMoney(tier.priceMinor, tier.currency, intl)}
                  </span>
                  {tier.isPopular ? (
                    <Pill tone="info">{t('activities.tier_popular_pill')}</Pill>
                  ) : null}
                  {tier.status === 'published' ? null : <Pill tone="bad">{t('common.draft')}</Pill>}
                </span>
              ),
            }))}
          />
        </div>
      ) : null}
      <TierEditor
        activityId={activity.id}
        tiers={tiers.map((tier) => ({
          id: tier.id,
          key: tier.key,
          name: tier.name,
          tagline: tier.tagline,
          priceMinor: tier.priceMinor,
          currency: tier.currency,
          pricingMode: tier.pricingMode,
          groupMax: tier.groupMax,
          maxGuests: tier.maxGuests,
          minGuests: tier.minGuests,
          includes: tier.includes,
          excludes: tier.excludes,
          includesAddons: tier.includesAddons,
          available: tier.available,
          isPopular: tier.isPopular,
          features: tier.features,
          highlights: tier.highlights,
          details: tier.details,
          notes: tier.notes,
          status: tier.status,
          childPriceMinor: tier.childPriceMinor,
        }))}
        currency={activity.currency}
        addons={addons.options}
        locked={locked}
      />
      <SeasonEditor
        activityId={activity.id}
        locked={locked}
        tiers={tiers.map((tier) => ({
          id: tier.id,
          name: pick(tier.name, locale, tier.key),
          currency: tier.currency,
          priceMinor: tier.priceMinor,
          childPriceMinor: tier.childPriceMinor,
        }))}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Activities included in packages
// ---------------------------------------------------------------------------

async function IncludedTab({ activity }: { activity: ActivityRow }) {
  const { locale } = await getAdminI18n()
  const [tiers, choices] = await Promise.all([loadTiers(activity.id), activityOptions()])
  const rows =
    tiers.length === 0
      ? []
      : await db
          .select({
            id: tierIncludedActivities.id,
            tierId: tierIncludedActivities.tierId,
            activityId: tierIncludedActivities.activityId,
            timing: tierIncludedActivities.timing,
            name: activities.name,
            slug: activities.slug,
          })
          .from(tierIncludedActivities)
          .innerJoin(activities, eq(activities.id, tierIncludedActivities.activityId))
          .where(
            inArray(
              tierIncludedActivities.tierId,
              tiers.map((tier) => tier.id),
            ),
          )
          .orderBy(asc(tierIncludedActivities.sortOrder))
  return (
    <IncludedEditor
      activityId={activity.id}
      tiers={tiers.map((tier) => ({
        id: tier.id,
        name: pick(tier.name, locale, tier.key),
        included: rows
          .filter((row) => row.tierId === tier.id)
          .map((row) => ({
            id: row.id,
            activityId: row.activityId,
            name: pick(row.name, locale, row.slug),
            timing: row.timing === 'own_slot' ? 'own_slot' : 'same_slot',
          })),
      }))}
      choices={choices.filter((choice) => choice.value !== activity.id)}
    />
  )
}

// ---------------------------------------------------------------------------
// Extras
// ---------------------------------------------------------------------------

async function AddonsTab({
  activity,
  intl,
  locked,
}: {
  activity: ActivityRow
  intl: string
  locked: boolean
}) {
  const { locale } = await getAdminI18n()
  const [tiers, addons, library, links] = await Promise.all([
    loadTiers(activity.id),
    addonOptions(activity.id, locale),
    db
      .select()
      .from(addonsLibrary)
      .where(isNull(addonsLibrary.deletedAt))
      .orderBy(asc(addonsLibrary.sortOrder), asc(addonsLibrary.createdAt)),
    db
      .select()
      .from(activityAddonLinks)
      .where(eq(activityAddonLinks.activityId, activity.id))
      .orderBy(asc(activityAddonLinks.sortOrder)),
  ])
  const packages = tiers.map((tier) => ({
    value: tier.id,
    label: pick(tier.name, locale, tier.key),
  }))
  return (
    <>
      <LibraryLinks
        activityId={activity.id}
        locked={locked}
        packages={packages}
        library={library.map((addon) => ({
          id: addon.id,
          name: pick(addon.name, locale),
          price: formatMoney(addon.priceMinor, addon.currency, intl),
          currency: addon.currency,
          available: addon.available,
        }))}
        links={links.map((link) => ({
          addonId: link.addonId,
          priceMinor: link.priceMinor,
          onlyPackages: link.onlyPackages ?? [],
          required: link.required,
          sortOrder: link.sortOrder,
        }))}
      />
      <AddonEditor
        activityId={activity.id}
        locked={locked}
        currency={activity.currency}
        packages={packages}
        addons={addons.own.map((addon) => ({
          id: addon.id,
          name: addon.name,
          description: addon.description,
          priceMinor: addon.priceMinor,
          currency: addon.currency,
          pricing: addon.pricing,
          maxQty: addon.maxQty,
          onlyPackages: addon.onlyPackages,
          requiresAddonId: addon.requiresAddonId,
          available: addon.available,
          sortOrder: addon.sortOrder,
        }))}
      />
    </>
  )
}
