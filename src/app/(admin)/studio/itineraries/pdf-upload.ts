/**
 * One PDF upload for one language as a new version — shared by the server
 * action (plain form) and the «ملف PDF» tab's route (drag & drop with a
 * progress bar). Server-only; checks `content.write` itself.
 *
 * The new file becomes current (and `uploaded_pdf_keys` points at it, so
 * delivery picks it — `@/lib/itineraries/delivered-pdf`); older versions
 * stay as archived rows, never deleted.
 *
 * Storage: Spaces when configured, else the private volume
 * (`PRIVATE_STORAGE_DIR`, via `uploadPrivate`), else — development only —
 * `public/`. Every failure comes back as a clear Studio message, never a
 * raw driver error.
 */

import { randomUUID } from 'node:crypto'

import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import { db } from '@/db'
import { itineraries, itineraryDocuments } from '@/db/schema'
import { isLocale } from '@/i18n/config'
import { cleanDownloadFilename, isPdfMime, looksLikePdf } from '@/lib/itineraries/publish-gate'
import { readItinerarySales } from '@/lib/itineraries/sales-settings-store'
import { isPrivateStorageAvailable, readPrivateObject, uploadPrivate } from '@/lib/storage'

import { writeAudit } from '../../_lib/audit'
import { fbool, fstr } from '../../_lib/form'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import { notifyItineraryHolders } from './notify-holders'

export type UploadOutcome = { ok: string } | { err: string }

/** Where the bytes go. Exported for the local-storage test. */
export async function storeItineraryPdf(objectKey: string, bytes: Uint8Array): Promise<void> {
  if (isPrivateStorageAvailable()) {
    await uploadPrivate({ key: objectKey, body: bytes, contentType: 'application/pdf' })
    return
  }
  if (process.env.NODE_ENV === 'production') throw new Error('no-storage')
  // Local development only (production without storage is refused above).
  const { mkdir, writeFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const target = path.join(process.cwd(), 'public', objectKey)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

/** Read back what `storeItineraryPdf` wrote (staff preview). */
export async function readStoredPdf(objectKey: string): Promise<Uint8Array | null> {
  if (isPrivateStorageAvailable()) return readPrivateObject(objectKey)
  if (process.env.NODE_ENV === 'production') return null
  const { readFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const root = path.join(process.cwd(), 'public')
  const file = path.normalize(path.join(root, objectKey))
  if (!file.startsWith(root + path.sep)) return null
  try {
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}

export async function uploadPdfCore(id: string, form: FormData): Promise<UploadOutcome> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  try {
    const rawLocale = fstr(form, 'locale') ?? ''
    if (!isLocale(rawLocale)) throw new Error(t('itineraries.err_pdf_language'))
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0)
      throw new Error(t('itineraries.err_pdf_missing'))
    const settings = await readItinerarySales()
    if (file.size > settings.maxUploadMb * 1024 * 1024) {
      throw new Error(t('ip1.err_pdf_size', { mb: settings.maxUploadMb }))
    }
    if (!isPdfMime(file.type)) throw new Error(t('itineraries.err_pdf_not_pdf'))
    if (!isPrivateStorageAvailable() && process.env.NODE_ENV === 'production') {
      throw new Error(t('itineraries.err_pdf_storage'))
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (!looksLikePdf(bytes)) throw new Error(t('itineraries.err_pdf_not_pdf'))

    const [before] = await db
      .select()
      .from(itineraries)
      .where(and(eq(itineraries.id, id), isNull(itineraries.deletedAt)))
      .limit(1)
    if (!before) throw new Error(t('itineraries.err_gone'))

    const notify = fbool(form, 'notifyBuyers')
    const downloadFilename =
      cleanDownloadFilename(fstr(form, 'downloadFilename')) ??
      cleanDownloadFilename(file.name) ??
      `${before.slug}-${rawLocale}.pdf`

    // An unguessable key: the original is never exposed (delivered stamped).
    const objectKey = `itineraries/${id}/uploaded/${rawLocale}-${randomUUID()}.pdf`
    try {
      await storeItineraryPdf(objectKey, bytes)
    } catch (error) {
      console.error('[studio] itinerary PDF store failed', errorMessage(error))
      throw new Error(t('ie.err_pdf_write'))
    }

    const keys = { ...(before.uploadedPdfKeys ?? {}), [rawLocale]: objectKey }
    const fileVersion = await db.transaction(async (tx) => {
      // Serialise uploads of the same itinerary so versions never collide.
      await tx.execute(sql`select 1 from ${itineraries} where ${itineraries.id} = ${id} for update`)
      const [last] = await tx
        .select({ v: itineraryDocuments.fileVersion })
        .from(itineraryDocuments)
        .where(
          and(
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.locale, rawLocale),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
        .orderBy(desc(itineraryDocuments.fileVersion))
        .limit(1)
      const next = (last?.v ?? 0) + 1
      await tx
        .update(itineraryDocuments)
        .set({ isCurrent: false })
        .where(
          and(
            eq(itineraryDocuments.itineraryId, id),
            eq(itineraryDocuments.locale, rawLocale),
            eq(itineraryDocuments.source, 'uploaded'),
          ),
        )
      await tx.insert(itineraryDocuments).values({
        itineraryId: id,
        // 0 = never an itinerary version, so generated-file readers skip it.
        version: 0,
        locale: rawLocale,
        objectKey,
        bytes: bytes.byteLength,
        source: 'uploaded',
        fileVersion: next,
        isCurrent: true,
        downloadFilename,
        notifyBuyers: notify,
        uploadedById: session.userId,
      })
      await tx.update(itineraries).set({ uploadedPdfKeys: keys }).where(eq(itineraries.id, id))
      return next
    })

    await writeAudit({
      actor: session,
      action: 'itinerary.pdf_upload',
      entityType: 'itinerary',
      entityId: id,
      before: { uploadedPdfKeys: before.uploadedPdfKeys },
      after: { uploadedPdfKeys: keys, bytes: bytes.byteLength, fileVersion, downloadFilename },
    })
    const notified = notify ? await notifyItineraryHolders(before, rawLocale, keys) : 0
    return {
      ok:
        t('ip1.ok_pdf_version', {
          version: fileVersion,
          locale: t(`translations.lang_${rawLocale}`),
        }) + (notified > 0 ? ` ${t('itineraries.ok_pdf_notified', { count: notified })}` : ''),
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    return { err: errorMessage(error) }
  }
}
