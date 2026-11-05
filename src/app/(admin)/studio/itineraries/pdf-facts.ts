/** Reads behind the phase-1 PDF status and publish gate (`@/lib/itineraries/publish-gate`). */

import { and, eq, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { itineraries, itineraryDays, itineraryDocuments } from '@/db/schema'
import { pdfStatus, type PdfFacts, type PdfStatus } from '@/lib/itineraries/publish-gate'

type Reader = Pick<typeof db, 'select'>

const ARABIC = 'ar'

/** Facts for the Arabic file of one itinerary (the publish rule). */
export async function arabicPdfFacts(
  tx: Reader,
  itinerary: Pick<typeof itineraries.$inferSelect, 'id' | 'uploadedPdfKeys'>,
  days: readonly { activityId: string | null; isFreeDay: boolean }[],
): Promise<PdfFacts> {
  const docs = await tx
    .select({
      source: itineraryDocuments.source,
      fileVersion: itineraryDocuments.fileVersion,
      isCurrent: itineraryDocuments.isCurrent,
    })
    .from(itineraryDocuments)
    .where(
      and(eq(itineraryDocuments.itineraryId, itinerary.id), eq(itineraryDocuments.locale, ARABIC)),
    )
  return factsFrom(itinerary, ARABIC, docs, days)
}

function factsFrom(
  itinerary: Pick<typeof itineraries.$inferSelect, 'uploadedPdfKeys'>,
  locale: string,
  docs: readonly { source: string; fileVersion: number; isCurrent: boolean }[],
  days: readonly { activityId: string | null; isFreeDay: boolean }[],
): PdfFacts {
  const current = docs.find((d) => d.source === 'uploaded' && d.isCurrent)
  // A key uploaded before versioning existed counts as version 1.
  const legacyUpload = itinerary.uploadedPdfKeys?.[locale] ? 1 : null
  return {
    uploadedVersion: current?.fileVersion ?? legacyUpload,
    generatedExists: docs.some((d) => d.source === 'generated'),
    dayCount: days.length,
    unresolvedDays: days.filter((d) => !d.activityId && !d.isFreeDay).length,
  }
}

/** Arabic PDF status for many itineraries at once (the Studio list column). */
export async function pdfStatusMany(
  rows: readonly Pick<typeof itineraries.$inferSelect, 'id' | 'uploadedPdfKeys'>[],
): Promise<Map<string, PdfStatus>> {
  const out = new Map<string, PdfStatus>()
  if (rows.length === 0) return out
  const ids = rows.map((r) => r.id)
  const [docs, days] = await Promise.all([
    db
      .select({
        itineraryId: itineraryDocuments.itineraryId,
        source: itineraryDocuments.source,
        fileVersion: itineraryDocuments.fileVersion,
        isCurrent: itineraryDocuments.isCurrent,
      })
      .from(itineraryDocuments)
      .where(
        and(inArray(itineraryDocuments.itineraryId, ids), eq(itineraryDocuments.locale, ARABIC)),
      ),
    db
      .select({
        itineraryId: itineraryDays.itineraryId,
        activityId: itineraryDays.activityId,
        isFreeDay: itineraryDays.isFreeDay,
      })
      .from(itineraryDays)
      .where(inArray(itineraryDays.itineraryId, ids)),
  ])
  for (const row of rows) {
    out.set(
      row.id,
      pdfStatus(
        factsFrom(
          row,
          ARABIC,
          docs.filter((d) => d.itineraryId === row.id),
          days.filter((d) => d.itineraryId === row.id),
        ),
      ),
    )
  }
  return out
}
