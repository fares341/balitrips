import { and, inArray, isNotNull, isNull } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import { activities, activityImages, activityTiers, media } from '@/db/schema'
import { pick } from '@/lib/content/localize'
import { mediaUrl } from '@/lib/content/queries'

import { adminHref } from '../../../_lib/admin-path'
import { getAdminI18n } from '../../../_lib/i18n'
import { isPlaceholder } from '../../../_lib/media-refs'
import { requireCapability } from '../../../_lib/session'
import { PageHead } from '../../../_ui/shell'
import { Empty, Pill, Table } from '../../../_ui/table'
import {
  analyseActivity,
  MIN_HEIGHT,
  MIN_WIDTH,
  type Issue,
  type IssueKind,
  type ReportActivity,
  type ReportImage,
} from './analyse'

export const dynamic = 'force-dynamic'

const KIND_KEYS: Record<IssueKind, string> = {
  no_hero: 'sr.img_no_hero',
  duplicate: 'sr.img_duplicate',
  placeholder: 'sr.img_placeholder',
  tiny: 'sr.img_tiny',
  other_source: 'sr.img_other_source',
}

/**
 * «صور مكررة أو غير مناسبة» (owner, Oct 2026): every activity whose pictures
 * need a look — no hero, the same picture twice, placeholder/SVG art, tiny
 * files, and (merged activities) pictures from another source activity.
 * Read-only; each row links to the activity's editor. The public page already
 * shows each picture once.
 */
export default async function ActivityImagesReport() {
  await requireCapability('content.write')
  const { t, locale } = await getAdminI18n()

  const rows = await db
    .select({
      id: activities.id,
      slug: activities.slug,
      name: activities.name,
      status: activities.status,
      heroImageId: activities.heroImageId,
      mergedIntoId: activities.mergedIntoId,
    })
    .from(activities)
    .where(isNull(activities.deletedAt))

  const live = rows.filter((row) => row.mergedIntoId === null && row.status !== 'archived')
  const sourcesOf = new Map<string, typeof rows>()
  for (const row of rows) {
    if (row.mergedIntoId === null) continue
    sourcesOf.set(row.mergedIntoId, [...(sourcesOf.get(row.mergedIntoId) ?? []), row])
  }
  const ids = rows.map((row) => row.id)

  const [galleryRows, tierRows] = await Promise.all([
    ids.length === 0
      ? []
      : db
          .select({
            activityId: activityImages.activityId,
            mediaId: activityImages.mediaId,
            sortOrder: activityImages.sortOrder,
          })
          .from(activityImages)
          .where(inArray(activityImages.activityId, ids)),
    ids.length === 0
      ? []
      : db
          .select({
            activityId: activityTiers.activityId,
            name: activityTiers.name,
            key: activityTiers.key,
            imageId: activityTiers.imageId,
            sortOrder: activityTiers.sortOrder,
          })
          .from(activityTiers)
          .where(and(inArray(activityTiers.activityId, ids), isNull(activityTiers.deletedAt))),
  ])

  const mediaIds = [
    ...new Set([
      ...rows.flatMap((row) => (row.heroImageId ? [row.heroImageId] : [])),
      ...galleryRows.map((row) => row.mediaId),
      ...tierRows.flatMap((row) => (row.imageId ? [row.imageId] : [])),
    ]),
  ]
  const mediaRows =
    mediaIds.length === 0
      ? []
      : await db
          .select({
            id: media.id,
            objectKey: media.objectKey,
            mimeType: media.mimeType,
            width: media.width,
            height: media.height,
            credit: media.credit,
            deletedAt: media.deletedAt,
          })
          .from(media)
          .where(and(inArray(media.id, mediaIds), isNotNull(media.objectKey)))
  const images = new Map<string, ReportImage>(
    mediaRows.map((row) => [
      row.id,
      {
        id: row.id,
        objectKey: row.objectKey,
        mimeType: row.mimeType,
        width: row.width,
        height: row.height,
        placeholder: isPlaceholder(row.credit),
        deleted: row.deletedAt !== null,
      },
    ]),
  )
  const image = (id: string | null) => (id === null ? null : (images.get(id) ?? null))
  const galleryOf = (activityId: string) =>
    galleryRows
      .filter((row) => row.activityId === activityId)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((row) => image(row.mediaId))
      .filter((item): item is ReportImage => item !== null)

  const report: { activity: ReportActivity; issues: Issue[] }[] = []
  for (const row of live) {
    const activity: ReportActivity = {
      id: row.id,
      slug: row.slug,
      name: pick(row.name, locale, row.slug),
      status: row.status,
      hero: image(row.heroImageId),
      gallery: galleryOf(row.id),
      packages: tierRows
        .filter((tier) => tier.activityId === row.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((tier) => ({ name: pick(tier.name, locale, tier.key), image: image(tier.imageId) })),
      sources: (sourcesOf.get(row.id) ?? []).map((source) => ({
        name: pick(source.name, locale, source.slug),
        heroId: source.heroImageId,
        imageIds: galleryRows
          .filter((item) => item.activityId === source.id)
          .map((item) => item.mediaId),
      })),
    }
    const issues = analyseActivity(activity, t('sr.img_gallery'))
    if (issues.length > 0) report.push({ activity, issues })
  }
  report.sort((a, b) => b.issues.length - a.issues.length)

  return (
    <>
      <PageHead
        title={t('sr.img_title')}
        description={t('sr.img_description', { w: MIN_WIDTH, h: MIN_HEIGHT })}
        actions={
          <Link className="a-btn ghost" href={adminHref('/activities')}>
            {t('sr.img_back')}
          </Link>
        }
      />

      {report.length === 0 ? (
        <Empty>{t('sr.img_none')}</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <th>{t('sr.img_col_activity')}</th>
              <th>{t('sr.img_col_issues')}</th>
            </tr>
          </thead>
          <tbody>
            {report.map(({ activity, issues }) => (
              <tr key={activity.id}>
                <td style={{ verticalAlign: 'top', minWidth: 180 }}>
                  <Link href={adminHref(`/activities/${activity.id}`)}>
                    <strong>{activity.name}</strong>
                  </Link>
                  <div className="a-hint" dir="ltr">
                    /{activity.slug} · {activity.status}
                  </div>
                </td>
                <td>
                  <ul style={{ margin: 0, paddingInlineStart: 18, display: 'grid', gap: 6 }}>
                    {issues.map((issue, index) => (
                      <li key={`${issue.kind}-${issue.image?.id ?? 'none'}-${index}`}>
                        <Pill
                          tone={
                            issue.kind === 'no_hero' || issue.kind === 'placeholder'
                              ? 'bad'
                              : 'warn'
                          }
                        >
                          {t(KIND_KEYS[issue.kind])}
                        </Pill>{' '}
                        {issue.image ? (
                          <a
                            href={mediaUrl(issue.image.objectKey)}
                            target="_blank"
                            rel="noopener noreferrer"
                            dir="ltr"
                          >
                            {issue.image.objectKey.split('/').pop()}
                          </a>
                        ) : null}
                        {issue.image && issue.kind === 'tiny' ? (
                          <span className="a-hint" dir="ltr">
                            {' '}
                            ({issue.image.width}×{issue.image.height})
                          </span>
                        ) : null}
                        {issue.where.length > 0 ? (
                          <span className="a-hint">
                            {' — '}
                            {issue.kind === 'other_source'
                              ? t('sr.img_from', { names: issue.where.join('، ') })
                              : t('sr.img_where', { places: issue.where.join(' · ') })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  )
}
