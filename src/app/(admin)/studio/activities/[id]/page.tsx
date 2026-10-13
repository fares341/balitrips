import { and, asc, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { activities, activityCategories, activityTiers } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { baliInputValue } from '../../../_lib/bali-time'
import { categoryOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import {
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

  const title = activity ? pick(activity.name, 'en', activity.slug) : 'New activity'

  return (
    <>
      <PageHead
        title={title}
        description={
          activity
            ? `Slug /activities/${activity.slug} — every localized field is authored here in all three locales.`
            : 'Author in English first; Arabic and Indonesian can be filled in later and fall back until they are.'
        }
        actions={
          <Link className="a-btn ghost" href={adminHref('/activities')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveActivity.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field
              label="Slug *"
              htmlFor="slug"
              hint="Permanent public URL. Changing it breaks links."
            >
              <TextInput
                id="slug"
                name="slug"
                defaultValue={activity?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field
              label="Legacy id"
              htmlFor="legacyId"
              hint="Handoff id, kept for seed cross-references."
            >
              <TextInput id="legacyId" name="legacyId" defaultValue={activity?.legacyId ?? ''} />
            </Field>
            <StatusField value={activity?.status} />
            <Field label="Sort order" htmlFor="sortOrder">
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
          <h2>Copy</h2>
          <LocalizedField name="name" label="Name" value={activity?.name} required />
          <LocalizedField name="area" label="Area" value={activity?.area} />
          <LocalizedField name="duration" label="Duration" value={activity?.duration} />
          <LocalizedField
            name="description"
            label="Description"
            value={activity?.description}
            rows={6}
          />
          <LocalizedField
            name="cancellationPolicy"
            label="Cancellation policy"
            value={activity?.cancellationPolicy}
            rows={4}
            hint="Per-activity. The prototype showed one shared policy on every tour."
          />
        </div>

        <div className="a-card">
          <h2>Commercial</h2>
          <div className="a-row">
            <MoneyField minor={activity?.priceMinor} currency={activity?.currency} />
            <Field
              label="Rating (tenths)"
              htmlFor="ratingTenths"
              hint="47 means 4.7. Blank means unrated."
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
            <Field label="Review count" htmlFor="reviewCount">
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
              label="Region"
              options={regions}
              value={activity?.regionId}
            />
          </div>
          <MediaPicker
            name="heroImageId"
            label="Hero image"
            items={mediaList}
            value={activity?.heroImageId}
            hint="Picked visually rather than by object key — a list of filenames is how a temple photograph ends up on a snorkelling tour. Anything badged “placeholder” is generated artwork awaiting real photography."
          />
          <OptionChecklist
            name="categoryIds"
            label="Categories"
            options={categories}
            values={selectedCategories.map((row) => row.categoryId)}
          />
        </div>

        <div className="a-card">
          <h2>Booking rules</h2>
          <div className="a-row">
            <Field
              label="Lead time (hours)"
              htmlFor="leadTimeHours"
              hint="Booking closes this many hours before the slot. Without it a 09:00 tour can be booked at 03:00."
            >
              <TextInput
                id="leadTimeHours"
                name="leadTimeHours"
                inputMode="numeric"
                defaultValue={String(activity?.leadTimeHours ?? 24)}
              />
            </Field>
            <Field label="Max guests" htmlFor="maxGuests">
              <TextInput
                id="maxGuests"
                name="maxGuests"
                inputMode="numeric"
                defaultValue={String(activity?.maxGuests ?? 20)}
              />
            </Field>
          </div>
          <div className="a-row">
            <Field
              label="Event starts (Bali time)"
              htmlFor="eventStartsAt"
              hint="Only for dated events (category “events”). Empty = always available."
            >
              <TextInput
                id="eventStartsAt"
                name="eventStartsAt"
                type="datetime-local"
                defaultValue={baliInputValue(activity?.eventStartsAt)}
              />
            </Field>
            <Field
              label="Event ends (Bali time)"
              htmlFor="eventEndsAt"
              hint="Optional. Without it, the event leaves the Events page a day after it starts."
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
            label="Time slots"
            htmlFor="timeSlots"
            hint="One HH:mm per line. Leave empty for no fixed slots. Per-activity — the prototype hard-coded 09:00/11:30/14:00/16:30 everywhere."
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
          <h2>What is included</h2>
          <LocalizedListField name="included" label="Included" values={activity?.included} />
          <LocalizedListField name="excluded" label="Not included" values={activity?.excluded} />
        </div>

        <div className="a-card">
          <FaqField entries={activity?.faq} maxRows={FAQ_ROWS} />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save activity
          </button>
          {!can(session.role, 'content.publish') ? (
            <span className="a-hint">
              Your role cannot publish — saving as Published will be rejected.
            </span>
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
            maxGuests: tier.maxGuests,
            isPopular: tier.isPopular,
            features: tier.features,
            highlights: tier.highlights,
            details: tier.details,
            notes: tier.notes,
            status: tier.status,
          }))}
          currency={activity.currency}
        />
      ) : null}

      {activity ? (
        <form className="a-card" action={deleteActivity.bind(null, activity.id)}>
          <h2>Archive</h2>
          <p className="a-hint">
            Soft delete. The row stays so historical orders, reviews and day plans keep their
            anchor; it disappears from the catalogue and cannot be sold.
          </p>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              Archive activity
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
