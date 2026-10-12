import { and, eq, isNull } from 'drizzle-orm'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { reviews } from '@/db/schema'

import { adminHref } from '../../../_lib/admin-path'
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
        title={review ? review.authorName : 'New review'}
        actions={
          <Link className="a-btn ghost" href={adminHref('/reviews')}>
            Back to list
          </Link>
        }
      />
      <Flash searchParams={query} />

      <form className="a-form" action={saveReview.bind(null, isNew ? 'new' : id)}>
        <div className="a-card">
          <h2>Review</h2>
          <div className="a-row">
            <Field label="Author name *" htmlFor="authorName">
              <TextInput
                id="authorName"
                name="authorName"
                defaultValue={review?.authorName ?? ''}
                required
                maxLength={128}
              />
            </Field>
            <Field label="Stars *" htmlFor="stars" hint="1 to 5.">
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
              label="Activity"
              options={activities}
              value={review?.activityId}
              hint="An unattached review is never shown next to a tour it does not belong to."
            />
            <Field
              label="Order id"
              htmlFor="orderId"
              hint="Set when the review comes from a real booking. Shows as verified."
            >
              <TextInput id="orderId" name="orderId" defaultValue={review?.orderId ?? ''} />
            </Field>
          </div>
          <Checkbox
            name="isPublished"
            label="Published"
            defaultChecked={review?.isPublished ?? false}
          />
        </div>

        <div className="a-card">
          <h2>Copy</h2>
          <LocalizedField
            name="authorCountry"
            label="Author country"
            value={review?.authorCountry}
          />
          <LocalizedField name="body" label="Body" value={review?.body} rows={5} />
        </div>

        <div className="a-actions">
          <button className="a-btn" type="submit">
            Save review
          </button>
        </div>
      </form>

      {review ? (
        <form className="a-card" action={deleteReview.bind(null, review.id)}>
          <h2>Archive</h2>
          <div className="a-actions" style={{ marginBlockStart: 12 }}>
            <button className="a-btn danger" type="submit">
              Archive review
            </button>
          </div>
        </form>
      ) : null}
    </>
  )
}
