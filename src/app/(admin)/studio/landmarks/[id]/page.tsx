import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { landmarks } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { activityOptions, mediaOptions, regionOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Advanced } from '../../../_ui/advanced'
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
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
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
        title={landmark ? pick(landmark.name, 'en', landmark.slug) : t('landmarks.new')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/landmarks')}>
            {t('landmarks.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveLandmark.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('landmarks.identity')}</h2>
          <div className="a-row">
            <Field label={`${t('common.slug')} *`} htmlFor="slug">
              <TextInput
                id="slug"
                name="slug"
                defaultValue={landmark?.slug ?? ''}
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
              />
            </Field>
            <Advanced
              show={session.role === 'admin'}
              title={t('common.advanced')}
              keep={[['legacyId', landmark?.legacyId ?? '']]}
            >
              <Field label={t('landmarks.legacy_id')} htmlFor="legacyId">
                <TextInput id="legacyId" name="legacyId" defaultValue={landmark?.legacyId ?? ''} />
              </Field>
            </Advanced>
            <StatusField value={landmark?.status} />
            <Field label={t('landmarks.sort_order')} htmlFor="sortOrder">
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
          <h2>{t('landmarks.copy')}</h2>
          <LocalizedField name="name" label={t('common.name')} value={landmark?.name} required />
          <LocalizedField name="type" label={t('common.type')} value={landmark?.type} />
          <LocalizedField
            name="blurb"
            label={t('landmarks.blurb')}
            value={landmark?.blurb}
            rows={4}
          />
        </div>

        <div className="a-card">
          <h2>{t('landmarks.links')}</h2>
          <div className="a-row">
            <OptionField
              name="regionId"
              label={t('landmarks.region')}
              options={regions}
              value={landmark?.regionId}
            />
            <OptionField
              name="activityId"
              label={t('landmarks.bookable_activity')}
              options={activities}
              value={landmark?.activityId}
              hint={t('landmarks.activity_hint')}
            />
            <OptionField
              name="heroImageId"
              label={t('landmarks.hero_image')}
              options={mediaList}
              value={landmark?.heroImageId}
            />
          </div>
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('landmarks.save')}
          </button>
        </div>
      </form>

      {landmark ? (
        <form className="a-card" action={deleteLandmark.bind(null, landmark.id)}>
          <h2>{t('landmarks.archive')}</h2>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('landmarks.archive_btn')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
