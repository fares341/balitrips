import { NextResponse } from 'next/server'

import { db } from '@/db'
import { reportExports } from '@/db/schema'
import {
  isListingKind,
  listingParams,
  listingReportId,
  mayExportListing,
  parseListingFilters,
} from '@/lib/reports/listing'
import { localRedirect } from '@/lib/http/local-redirect'

import { adminHref } from '../../../_lib/admin-path'
import { writeAudit } from '../../../_lib/audit'
import { getAdminI18n } from '../../../_lib/i18n'
import { encodeMessage, withOutcome } from '../../../_lib/result'
import { requireCapability } from '../../../_lib/session'

/**
 * «تصدير PDF» next to a screen's CSV: queue a listing PDF with the screen's
 * filters (`from`, `to`, `status`, `q`). Chromium runs in the worker only, so
 * this inserts a `report_exports` row and sends the person to Reports → PDF
 * downloads, where it appears when ready. Who may ask: `LISTING_ACCESS`
 * (checked again with the current role when it is rendered). Audited.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ kind: string }> }) {
  const session = await requireCapability('admin.access')
  const { kind } = await params
  if (!isListingKind(kind) || !mayExportListing(session.role, kind)) {
    return new NextResponse(null, { status: 404 })
  }
  const { locale } = await getAdminI18n()
  const url = new URL(request.url)
  const filters = parseListingFilters(Object.fromEntries(url.searchParams))
  const back = url.searchParams.get('back')

  await writeAudit({
    actor: session,
    action: 'report.export_pdf',
    entityType: 'report',
    entityId: null,
    before: null,
    after: { report: listingReportId(kind), filters: listingParams(filters) },
  })

  const [row] = await db
    .insert(reportExports)
    .values({
      report: listingReportId(kind),
      params: listingParams(filters),
      locale,
      requestedBy: session.userId,
    })
    .returning({ id: reportExports.id })
  if (row) {
    const { enqueueReportPdf } = await import('@/worker/queues')
    await enqueueReportPdf(row.id)
  }
  // Back to the screen it came from (a Studio path only), else the downloads list.
  const target = back && /^\/[a-z0-9/_-]*$/i.test(back) ? back : '/reports/exports'
  return localRedirect(withOutcome(adminHref(target), { ok: encodeMessage('pdf.queued') }), 303)
}
