import { randomUUID } from 'node:crypto'

import { db } from '@/db'
import { media } from '@/db/schema'
import type { Localized } from '@/db/schema'

import { writeAudit } from './audit'
import type { Translate } from '../_i18n'
import { ImageRejected } from './image/inspect'
import { ingestImage } from './image/pipeline'
import { checkUpload, cleanName, nameFromFilename } from './media-names'
import type { AdminSession } from './session'

/**
 * One upload, shared by the media-library form, the bulk uploader and the
 * inline uploader inside every <MediaPicker> (all go through the same image
 * pipeline and the same audited row write — nothing is reimplemented here).
 */

export { checkUpload, cleanName, nameFromFilename, NAME_MAX, UPLOAD_TYPES } from './media-names'
export type { UploadProblem } from './media-names'

export interface UploadedMedia {
  id: string
  name: string
  objectKey: string
  width: number
  height: number
  bytes: number
  optimised: boolean
  derivatives: number
}

export async function ingestUpload(input: {
  file: File
  session: AdminSession
  t: Translate
  name?: string | null
  alt?: Localized | null
  credit?: string | null
}): Promise<UploadedMedia> {
  const { file, session, t } = input
  const problem = checkUpload(file, t)
  if (problem) throw new Error(problem.message)

  const mediaId = randomUUID()
  const name = cleanName(input.name) ?? nameFromFilename(file.name)

  let result
  try {
    result = await ingestImage({
      mediaId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      declaredMime: file.type === '' ? null : file.type,
      declaredName: file.name === '' ? null : file.name,
    })
  } catch (error) {
    if (error instanceof ImageRejected) {
      console.warn(`[media] upload refused: ${error.message}`)
      throw new Error(
        t('media.err_rejected', { detail: t(`media.reject_${error.reason}`, error.vars) }),
      )
    }
    throw error
  }

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(media)
      .values({
        id: mediaId,
        objectKey: result.objectKey,
        mimeType: result.mimeType,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        name,
        alt: input.alt ?? null,
        credit: input.credit ?? null,
      })
      .returning()
    if (!inserted) throw new Error(t('media.err_row_write'))

    await writeAudit(
      {
        actor: session,
        action: 'media.upload',
        entityType: 'media',
        entityId: inserted.id,
        before: null,
        after: {
          objectKey: inserted.objectKey,
          name,
          mimeType: inserted.mimeType,
          width: inserted.width,
          height: inserted.height,
          bytes: inserted.bytes,
          derivatives: result.derivatives.length,
          optimised: result.optimised,
          driver: result.driver,
          originalName: file.name,
        },
      },
      tx,
    )
    return inserted
  })

  return {
    id: row.id,
    name,
    objectKey: row.objectKey,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    optimised: result.optimised,
    derivatives: result.derivatives.length,
  }
}
