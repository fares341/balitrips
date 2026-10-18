import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import Link from 'next/link'

import { db } from '@/db'
import {
  activityLog,
  customTripDocuments,
  customTripRequests,
  itineraries,
  itineraryDocuments,
  orderItems,
  users,
} from '@/db/schema'
import { contactLabel } from '@/lib/auth/phone'
import { can } from '@/lib/auth/roles'
import { pick } from '@/lib/content/localize'

import { adminHref } from '../../_lib/admin-path'
import { getAdminI18n } from '../../_lib/i18n'
import { TRIP_STATUSES } from '../../_lib/lead-statuses'
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'
import { labelOr } from '../protection/labels'

export const dynamic = 'force-dynamic'

/**
 * PDF files — one read-only screen for every PDF the platform delivers.
 *
 *  - Itinerary PDFs (`itinerary_documents`): one per itinerary × version ×
 *    locale. Replaced from the itinerary's own page.
 *  - Custom-trip plans (`custom_trip_documents`): uploaded per request on the
 *    lead page, where they are also withdrawn or re-sent.
 *
 * Open/download counts come from `activity_log` (`view_pdf` / `download_pdf`),
 * which `deliverSchedule` writes with `details.orderItemId` = the order line
 * (itineraries) or the document id (custom plans), plus `details.locale`.
 * Customer contact details are shown only to roles that may read leads.
 */

const PDF_ACTIONS = ['view_pdf', 'download_pdf'] as const

function formatBytes(bytes: number | null, intl: string): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  const oneDecimal = new Intl.NumberFormat(intl, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  if (bytes < 1024 * 1024) return `${oneDecimal.format(bytes / 1024)} KB`
  return `${oneDecimal.format(bytes / (1024 * 1024))} MB`
}

/** Request statuses are a known set; anything else is shown as stored. */
function tripStatusKey(status: string): string | null {
  return (TRIP_STATUSES as readonly string[]).includes(status)
    ? `files.trip_status_${status}`
    : null
}

type Counts = { views: number; downloads: number }

function addCount(map: Map<string, Counts>, key: string, action: string, value: number) {
  const entry = map.get(key) ?? { views: 0, downloads: 0 }
  if (action === 'download_pdf') entry.downloads += value
  else entry.views += value
  map.set(key, entry)
}

export default async function FilesPage() {
  const session = await requireCapability('content.read')
  const mayReadLeads = can(session.role, 'leads.read')
  const { t, intl } = await getAdminI18n()

  const [itineraryDocs, itineraryCountRows] = await Promise.all([
    db
      .select({
        id: itineraryDocuments.id,
        itineraryId: itineraryDocuments.itineraryId,
        version: itineraryDocuments.version,
        locale: itineraryDocuments.locale,
        bytes: itineraryDocuments.bytes,
        createdAt: itineraryDocuments.createdAt,
        updatedAt: itineraryDocuments.updatedAt,
        slug: itineraries.slug,
        name: itineraries.name,
        currentVersion: itineraries.version,
        deletedAt: itineraries.deletedAt,
      })
      .from(itineraryDocuments)
      .innerJoin(itineraries, eq(itineraries.id, itineraryDocuments.itineraryId))
      .orderBy(
        asc(itineraries.slug),
        desc(itineraryDocuments.version),
        asc(itineraryDocuments.locale),
      ),
    db
      .select({
        itineraryId: orderItems.refId,
        version: orderItems.refVersion,
        locale: sql<string | null>`${activityLog.details}->>'locale'`,
        action: activityLog.action,
        total: sql<number>`count(*)::int`,
      })
      .from(activityLog)
      .innerJoin(orderItems, sql`${orderItems.id}::text = ${activityLog.details}->>'orderItemId'`)
      .where(and(inArray(activityLog.action, [...PDF_ACTIONS]), eq(orderItems.kind, 'itinerary')))
      .groupBy(
        orderItems.refId,
        orderItems.refVersion,
        sql`${activityLog.details}->>'locale'`,
        activityLog.action,
      ),
  ])

  const itineraryCounts = new Map<string, Counts>()
  for (const row of itineraryCountRows) {
    if (row.itineraryId === null) continue
    // An order line without a version is served the itinerary's current
    // version; it is counted under "*" and added to the current document.
    if (row.locale === null) continue
    const key = `${row.itineraryId}:${row.version ?? '*'}:${row.locale}`
    addCount(itineraryCounts, key, row.action, row.total)
  }
  const countsFor = (
    itineraryId: string,
    version: number,
    locale: string,
    isCurrent: boolean,
  ): Counts => {
    const exact = itineraryCounts.get(`${itineraryId}:${version}:${locale}`)
    const unversioned = isCurrent ? itineraryCounts.get(`${itineraryId}:*:${locale}`) : undefined
    return {
      views: (exact?.views ?? 0) + (unversioned?.views ?? 0),
      downloads: (exact?.downloads ?? 0) + (unversioned?.downloads ?? 0),
    }
  }

  const customDocs = mayReadLeads
    ? await db
        .select({
          doc: customTripDocuments,
          requestName: customTripRequests.name,
          requestEmail: customTripRequests.email,
          requestPhone: customTripRequests.phone,
          requestStatus: customTripRequests.status,
          accountEmail: users.email,
          accountPhone: users.phone,
        })
        .from(customTripDocuments)
        .innerJoin(customTripRequests, eq(customTripRequests.id, customTripDocuments.requestId))
        .leftJoin(users, eq(users.id, customTripRequests.userId))
        .orderBy(desc(customTripDocuments.createdAt))
        .limit(500)
    : []

  const customCounts = new Map<string, Counts>()
  if (customDocs.length > 0) {
    const rows = await db
      .select({
        docId: sql<string>`${activityLog.details}->>'orderItemId'`,
        action: activityLog.action,
        total: sql<number>`count(*)::int`,
      })
      .from(activityLog)
      .where(
        and(
          inArray(activityLog.action, [...PDF_ACTIONS]),
          sql`${activityLog.details}->>'orderItemId' in (select ${customTripDocuments.id}::text from ${customTripDocuments})`,
        ),
      )
      .groupBy(sql`${activityLog.details}->>'orderItemId'`, activityLog.action)
    for (const row of rows) addCount(customCounts, row.docId, row.action, row.total)
  }

  const live = itineraryDocs.filter((doc) => doc.deletedAt === null)
  const archived = itineraryDocs.length - live.length

  return (
    <>
      <PageHead title={t('files.title')} description={t('files.description')} />

      <section className="a-card">
        <h2>{t('files.itinerary_pdfs')}</h2>
        {live.length === 0 ? (
          <Empty>{t('files.empty_itinerary')}</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>{t('files.col_itinerary')}</th>
                <th>{t('files.col_version')}</th>
                <th>{t('files.col_language')}</th>
                <th>{t('files.col_size')}</th>
                <th>{t('files.col_uploaded')}</th>
                <th>{t('files.col_opens')}</th>
                <th>{t('files.col_downloads')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {live.map((doc) => {
                const counts = countsFor(
                  doc.itineraryId,
                  doc.version,
                  doc.locale,
                  doc.version === doc.currentVersion,
                )
                return (
                  <tr key={doc.id}>
                    <td>{pick(doc.name, 'en', doc.slug)}</td>
                    <td>
                      v{doc.version}{' '}
                      {doc.version === doc.currentVersion ? (
                        <Pill tone="good">{t('files.current')}</Pill>
                      ) : (
                        <Pill tone="neutral">{t('files.older')}</Pill>
                      )}
                    </td>
                    <td>{labelOr(t, 'translations.lang_', doc.locale)}</td>
                    <td>{formatBytes(doc.bytes, intl)}</td>
                    <td>
                      <When value={doc.updatedAt} />
                    </td>
                    <td>{counts.views}</td>
                    <td>{counts.downloads}</td>
                    <td>
                      <Link href={adminHref(`/itineraries/${doc.itineraryId}`)}>
                        {t('files.itinerary_link')}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {archived > 0 && (
          <p className="a-hint">{t('files.archived_hidden', { count: archived })}</p>
        )}
      </section>

      {mayReadLeads && (
        <section className="a-card">
          <h2>{t('files.custom_plans')}</h2>
          {customDocs.length === 0 ? (
            <Empty>{t('files.empty_custom')}</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>{t('files.col_request')}</th>
                  <th>{t('files.col_customer')}</th>
                  <th>{t('files.col_file')}</th>
                  <th>{t('files.col_size')}</th>
                  <th>{t('files.col_uploaded')}</th>
                  <th>{t('common.status')}</th>
                  <th>{t('files.col_opens')}</th>
                  <th>{t('files.col_downloads')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {customDocs.map((row) => {
                  const counts = customCounts.get(row.doc.id) ?? { views: 0, downloads: 0 }
                  const customer =
                    row.accountEmail !== null
                      ? contactLabel({ email: row.accountEmail, phone: row.accountPhone })
                      : (row.requestEmail ?? row.requestPhone ?? '—')
                  const statusKey = tripStatusKey(row.requestStatus)
                  return (
                    <tr key={row.doc.id}>
                      <td>
                        <span className="a-mono">
                          CT-{row.doc.requestId.slice(0, 8).toUpperCase()}
                        </span>
                        <div className="a-muted">
                          {statusKey ? t(statusKey) : row.requestStatus}
                        </div>
                      </td>
                      <td>
                        {row.requestName ?? '—'}
                        <div className="a-muted">{customer}</div>
                      </td>
                      <td>
                        {row.doc.filename}
                        <div className="a-muted">v{row.doc.version}</div>
                      </td>
                      <td>{formatBytes(row.doc.bytes, intl)}</td>
                      <td>
                        <When value={row.doc.createdAt} />
                      </td>
                      <td>
                        {row.doc.withdrawnAt !== null ? (
                          <>
                            <Pill tone="neutral">{t('files.withdrawn')}</Pill>{' '}
                            <When value={row.doc.withdrawnAt} />
                          </>
                        ) : (
                          <Pill tone="good">{t('files.delivered')}</Pill>
                        )}
                      </td>
                      <td>{counts.views}</td>
                      <td>{counts.downloads}</td>
                      <td>
                        <Link href={adminHref(`/leads/${row.doc.requestId}`)}>
                          {t('files.lead_link')}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          )}
        </section>
      )}
    </>
  )
}
