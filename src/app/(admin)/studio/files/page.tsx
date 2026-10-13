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
import { requireCapability } from '../../_lib/session'
import { PageHead } from '../../_ui/shell'
import { Empty, Pill, Table, When } from '../../_ui/table'

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

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
      <PageHead
        title="PDF files"
        description="Every PDF the site delivers: itinerary schedules (per version and language) and custom-trip plans. Read-only — replace an itinerary PDF on its itinerary page; upload, withdraw or re-send a custom plan on its lead."
      />

      <section className="a-card">
        <h2>Itinerary PDFs</h2>
        {live.length === 0 ? (
          <Empty>No itinerary PDFs yet.</Empty>
        ) : (
          <Table>
            <thead>
              <tr>
                <th>Itinerary</th>
                <th>Version</th>
                <th>Language</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Opens</th>
                <th>Downloads</th>
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
                    <td>
                      {pick(doc.name, 'en', doc.slug)}
                      <div className="a-muted a-mono">{doc.slug}</div>
                    </td>
                    <td>
                      v{doc.version}{' '}
                      {doc.version === doc.currentVersion ? (
                        <Pill tone="good">current</Pill>
                      ) : (
                        <Pill tone="neutral">older</Pill>
                      )}
                    </td>
                    <td className="a-mono">{doc.locale}</td>
                    <td>{formatBytes(doc.bytes)}</td>
                    <td>
                      <When value={doc.updatedAt} />
                    </td>
                    <td>{counts.views}</td>
                    <td>{counts.downloads}</td>
                    <td>
                      <Link href={adminHref(`/itineraries/${doc.itineraryId}`)}>
                        Itinerary / replace
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </Table>
        )}
        {archived > 0 && (
          <p className="a-hint">
            {archived} PDF{archived === 1 ? '' : 's'} of archived itineraries not shown.
          </p>
        )}
      </section>

      {mayReadLeads && (
        <section className="a-card">
          <h2>Custom-trip plans</h2>
          {customDocs.length === 0 ? (
            <Empty>No custom plans uploaded yet.</Empty>
          ) : (
            <Table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Customer</th>
                  <th>File</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Status</th>
                  <th>Opens</th>
                  <th>Downloads</th>
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
                  return (
                    <tr key={row.doc.id}>
                      <td>
                        <span className="a-mono">
                          CT-{row.doc.requestId.slice(0, 8).toUpperCase()}
                        </span>
                        <div className="a-muted">{row.requestStatus}</div>
                      </td>
                      <td>
                        {row.requestName ?? '—'}
                        <div className="a-muted">{customer}</div>
                      </td>
                      <td>
                        {row.doc.filename}
                        <div className="a-muted">v{row.doc.version}</div>
                      </td>
                      <td>{formatBytes(row.doc.bytes)}</td>
                      <td>
                        <When value={row.doc.createdAt} />
                      </td>
                      <td>
                        {row.doc.withdrawnAt !== null ? (
                          <>
                            <Pill tone="neutral">withdrawn</Pill>{' '}
                            <When value={row.doc.withdrawnAt} />
                          </>
                        ) : (
                          <Pill tone="good">delivered</Pill>
                        )}
                      </td>
                      <td>{counts.views}</td>
                      <td>{counts.downloads}</td>
                      <td>
                        <Link href={adminHref(`/leads/${row.doc.requestId}`)}>Lead / withdraw</Link>
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
