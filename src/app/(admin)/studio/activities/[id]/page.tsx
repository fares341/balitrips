import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { activities, activityAddons, activityCategories, activityTiers } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { baliInputValue } from '../../../_lib/bali-time'
import { categoryOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  StatusField,
  TextArea,
  TextInput,
} from '../../../_ui/field'
import { FaqField } from '../../../_ui/faq-field'
import { Flash } from '../../../_ui/flash'
import { loadPickerMedia, MediaPicker } from '../../../_ui/media-picker'
import { OptionChecklist, OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { getAdminI18n } from '../../../_lib/i18n'
import { AddonEditor } from './addon-editor'
import { TierEditor } from './tier-editor'
import { deleteActivity, saveActivity } from '../actions'

export const dynamic = 'force-dynamic'

/** Must match FAQ_ROWS in ../actions.ts — the action reads exactly this many slots. */
const FAQ_ROWS = 12

export default async function ActivityEditorPage({
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

  const tiers = activity
    ? await db
        .select()
        .from(activityTiers)
        .where(and(eq(activityTiers.activityId, activity.id), isNull(activityTiers.deletedAt)))
        .orderBy(asc(activityTiers.sortOrder), asc(activityTiers.priceMinor))
    : []

  const addons = activity
    ? await db
        .select()
        .from(activityAddons)
        .where(and(eq(activityAddons.activityId, activity.id), isNull(activityAddons.deletedAt)))
        .orderBy(asc(activityAddons.sortOrder), asc(activityAddons.createdAt))
    : []

  const [regions, categories, mediaList, selectedCategories] = await Promise.all([
    regionOptions(),
    categoryOptions(),
    loadPickerMedia(),
    activity
      ? db
          .select({ categoryId: activityCategories.categoryId })
          .from(activityCategories)
          .where(eq(activityCategories.activityId, activity.id))
      : Promise.resolve([]),
  ])

  const title = activity ? pick(activity.name, locale, activity.slug) : t('activities.new')

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
          <Link className="a-btn ghost" href={adminHref('/activities')}>
            {t('activities.back_to_list')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveActivity.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('activities.section_identity')}</h2>
          <div className="a-row">
            <Field
              label={t('activities.slug_required')}
              htmlFor="slug"
              hint={t('activities.slug_hint')}
            >
              <TextInput
                id="slug"
                name="slug"
                defaultValue={activity?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', activity?.legacyId ?? '']]}
            >
              <Field
                label={t('activities.legacy_id')}
                htmlFor="legacyId"
                hint={t('activities.legacy_id_hint')}
              >
                <TextInput id="legacyId" name="legacyId" defaultValue={activity?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <StatusField value={activity?.status} />
            <Field label={t('activities.sort_order')} htmlFor="sortOrder">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={String(activity?.sortOrder ?? 0)}
              />
            </Field>
          </div>
        </div>

        <div className="a-card">
          <h2>{t('activities.section_copy')}</h2>
          <LocalizedField
            name="name"
            label={t('activities.f_name')}
            value={activity?.name}
            required
          />
          <LocalizedField name="area" label={t('activities.f_area')} value={activity?.area} />
          <LocalizedField
            name="duration"
            label={t('activities.f_duration')}
            value={activity?.duration}
          />
          <LocalizedField
            name="description"
            label={t('activities.f_description')}
            value={activity?.description}
            rows={6}
          />
          <LocalizedField
            name="cancellationPolicy"
            label={t('activities.f_cancellation')}
            value={activity?.cancellationPolicy}
            rows={4}
            hint={t('activities.f_cancellation_hint')}
          />
        </div>

        <div className="a-card">
          <h2>{t('activities.section_commercial')}</h2>
          <div className="a-row">
            <MoneyField minor={activity?.priceMinor} currency={activity?.currency} />
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
          <div className="a-row">
            <OptionField
              name="regionId"
              label={t('activities.region')}
              options={regions}
              value={activity?.regionId}
            />
          </div>
          <MediaPicker
            name="heroImageId"
            label={t('activities.hero_image')}
            items={mediaList}
            value={activity?.heroImageId}
            hint={t('activities.hero_image_hint')}
          />
          <OptionChecklist
            name="categoryIds"
            label={t('activities.categories')}
            options={categories}
            values={selectedCategories.map((row) => row.categoryId)}
          />
        </div>

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
                defaultValue={String(activity?.leadTimeHours ?? 24)}
              />
            </Field>
            <Field label={t('activities.max_guests')} htmlFor="maxGuests">
              <TextInput
                id="maxGuests"
                name="maxGuests"
                inputMode="numeric"
                defaultValue={String(activity?.maxGuests ?? 20)}
              />
            </Field>
          </div>
          <Checkbox
            name="multiDay"
            label={t('activities.f_multi_day')}
            defaultChecked={activity?.multiDay ?? false}
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
                defaultValue={baliInputValue(activity?.eventStartsAt)}
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
                defaultValue={baliInputValue(activity?.eventEndsAt)}
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
              defaultValue={(activity?.timeSlots ?? []).join('\n')}
            />
          </Field>
        </div>

        <div className="a-card">
          <h2>{t('activities.section_included')}</h2>
          <LocalizedListField
            name="included"
            label={t('activities.included')}
            values={activity?.included}
          />
          <LocalizedListField
            name="excluded"
            label={t('activities.excluded')}
            values={activity?.excluded}
          />
        </div>

        <div className="a-card">
          <FaqField entries={activity?.faq} maxRows={FAQ_ROWS} />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('activities.save')}
          </button>
          {!can(session.role, 'content.publish') ? (
            <span className="a-hint">{t('activities.cannot_publish')}</span>
          ) : null}
        </div>
      </form>

      {activity ? (
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
          }))}
          currency={activity.currency}
          addons={addons.map((addon) => ({
            value: addon.id,
            label: pick(addon.name, locale),
          }))}
        />
      ) : null}

      {activity ? (
        <AddonEditor
          activityId={activity.id}
          currency={activity.currency}
          packages={tiers.map((tier) => ({
            value: tier.id,
            label: pick(tier.name, locale, tier.key),
          }))}
          addons={addons.map((addon) => ({
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
      ) : null}

      {activity ? (
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
