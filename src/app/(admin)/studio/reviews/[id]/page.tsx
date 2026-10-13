import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { reviews } from '@/db/schema'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { activityOptions } from '../../../_lib/lookups'
import { requireCapability } from '../../../_lib/session'
import { Checkbox, Field, LocalizedField, TextInput } from '../../../_ui/field'
import { Flash } from '../../../_ui/flash'
import { OptionField } from '../../../_ui/select-field'
import { PageHead } from '../../../_ui/shell'
import { deleteReview, saveReview } from '../actions'

export const dynamic = 'force-dynamic'

export default async function ReviewEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const { id } = await params
  const query = await searchParams

  const isNew = id === 'new'

  const review = isNew
    ? null
    : ((
        await db
          .select()
          .from(reviews)
          .where(and(eq(reviews.id, id), isNull(reviews.deletedAt)))
          .limit(1)
      )[0] ?? null)

  if (!isNew && !review) notFound()

  const activities = await activityOptions()

  return (
    <>
      <PageHead
        title={review ? review.authorName : t('reviews.new_title')}
        actions={
          <Link className="a-btn ghost" href={adminHref('/reviews')}>
            {t('reviews.back')}
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveReview.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>{t('reviews.review')}</h2>
          <div className="a-row">
            <Field label={`${t('reviews.author_name')} *`} htmlFor="authorName">
              <TextInput
                id="authorName"
                name="authorName"
                defaultValue={review?.authorName ?? ''}
                required
                maxLength={128}
              />
            </Field>
            <Field label={`${t('reviews.stars')} *`} htmlFor="stars" hint={t('reviews.stars_hint')}>
              <TextInput
                id="stars"
                name="stars"
                inputMode="numeric"
                defaultValue={String(review?.stars ?? 5)}
                required
              />
            </Field>
            <OptionField
              name="activityId"
              label={t('reviews.activity')}
              options={activities}
              value={review?.activityId}
              hint={t('reviews.activity_hint')}
            />
            <Field
              label={t('reviews.order_id')}
              htmlFor="orderId"
              hint={t('reviews.order_id_hint')}
            >
              <TextInput id="orderId" name="orderId" defaultValue={review?.orderId ?? ''} />
            </Field>
          </div>
          <Checkbox
            name="isPublished"
            label={t('common.published')}
            defaultChecked={review?.isPublished ?? false}
          />
        </div>

        <div className="a-card">
          <h2>{t('reviews.copy')}</h2>
          <LocalizedField
            name="authorCountry"
            label={t('reviews.author_country')}
            value={review?.authorCountry}
          />
          <LocalizedField name="body" label={t('reviews.body')} value={review?.body} rows={5} />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            {t('reviews.save')}
          </button>
        </div>
      </form>

      {review ? (
        <form className="a-card" action={deleteReview.bind(null, review.id)}>
          <h2>{t('reviews.archive')}</h2>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              {t('reviews.archive_btn')}
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
