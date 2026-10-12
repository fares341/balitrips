import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { landmarks } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { activityOptions, mediaOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Field, LocalizedField, StatusField, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { deleteLandmark, saveLandmark } from '../actions'

export const dynamic = 'force-dynamic'

export default async function LandmarkEditorPage({
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

  const landmark = isNew
    ? null
    : ((
        await db
          .select()
          .from(landmarks)
          .where(and(eq(landmarks.id, id), isNull(landmarks.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !landmark) notFound()

  const [regions, activities, mediaList] = await Promise.all([
    regionOptions(),
    activityOptions(),
    mediaOptions(),
  ])

  return (
    <>
      <PageHead
        title={landmark ? pick(landmark.name, 'en', landmark.slug) : 'New landmark'}
        actions={
          <Link className="a-btn ghost" href={adminHref('/landmarks')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveLandmark.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Identity</h2>
          <div className="a-row">
            <Field label="Slug *" htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={landmark?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Field label="Legacy id" htmlFor="legacyId">
              <TextInput id="legacyId" name="legacyId" defaultValue={landmark?.legacyId ?? ''} />
            </Field>
            <StatusField value={landmark?.status} />
            <Field label="Sort order" htmlFor="sortOrder">
              <TextInput
                id="sortOrder"
                name="sortOrder"
                inputMode="numeric"
                defaultValue={String(landmark?.sortOrder ?? 0)}
              />
            </Field>
          </div>
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField name="name" label="Name" value={landmark?.name} required />
          <LocalizedField name="type" label="Type" value={landmark?.type} />
          <LocalizedField name="blurb" label="Blurb" value={landmark?.blurb} rows={4} />
        </div>

        <div className="a-card">
          <h2>Links</h2>
          <div className="a-row">
            <OptionField
              name="regionId"
              label="Region"
              options={regions}
              value={landmark?.regionId}
            />
            <OptionField
              name="activityId"
              label="Bookable activity"
              options={activities}
              value={landmark?.activityId}
              hint="Set this and the card links straight to a purchasable tour."
            />
            <OptionField
              name="heroImageId"
              label="Hero image"
              options={mediaList}
              value={landmark?.heroImageId}
            />
          </div>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save landmark
          </button>
        </div>
      </form>

      {landmark ? (
        <form className="a-card" action={deleteLandmark.bind(null, landmark.id)}>
          <h2>Archive</h2>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              Archive landmark
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
