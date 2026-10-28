'use server'

/**
 * Spreadsheet import of activities (.xlsx or .csv, see
 * `@/lib/content/activity-sheet`). «Preview» reads the file and lists, per
 * activity, what is new / what would change / what is wrong — nothing is
 * written. «Apply» reads the same file again (its hash must match the
 * preview) and writes everything in one transaction. Never deletes.
 */

import { createHash } from 'node:crypto'

import { revalidatePath } from 'next/cache'

import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, localizeMessage } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'
import {
  applyPlan,
  archivedSlugs,
  fetchImages,
  loadContext,
  loadStored,
  MAX_FILE_BYTES,
  planRows,
  previewPlan,
  readUpload,
  type Preview,
} from './sheet'

export interface SheetImportState {
  stage: 'idle' | 'preview' | 'done' | 'error'
  fileName: string | null
  token: string | null
  preview: Preview | null
  message: string | null
  warnings: string[]
}

export async function sheetImport(
  _prev: SheetImportState,
  form: FormData,
): Promise<SheetImportState> {
  const session = await requireCapability('content.write')
  const { t } = await getAdminI18n()
  const mode = form.get('mode') === 'apply' ? 'apply' : 'preview'
  const empty: SheetImportState = {
    stage: 'error',
    fileName: null,
    token: null,
    preview: null,
    message: null,
    warnings: [],
  }
  try {
    const file = form.get('file')
    if (!(file instanceof File) || file.size === 0)
      return { ...empty, message: t('sh.choose_file') }
    if (file.size > MAX_FILE_BYTES) return { ...empty, message: t('sh.too_large') }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const token = createHash('sha256').update(bytes).digest('hex').slice(0, 32)

    const ctx = await loadContext()
    const { rows, issues } = await readUpload(file.name, bytes)
    const slugs = [
      ...new Set(rows.map((row) => (row.cells.activity_slug ?? '').trim().toLowerCase())),
    ]
    const [stored, archived] = await Promise.all([loadStored(ctx, { slugs }), archivedSlugs(slugs)])
    const existing = new Map(
      [...stored].map(([slug, item]) => [slug, { currency: item.row.currency }]),
    )
    const plan = planRows(rows, ctx.lookups, existing)
    plan.issues.unshift(...issues)
    const { preview, blocking } = previewPlan(plan, stored, archived, session, t)
    const base = { fileName: file.name, token, preview, warnings: [] as string[] }

    if (rows.length === 0 && blocking.length === 0) {
      return { ...base, stage: 'error', message: t('sh.no_rows') }
    }
    if (mode === 'preview') {
      return {
        ...base,
        stage: 'preview',
        message:
          blocking.length > 0
            ? t('sh.fix_first', { count: blocking.length })
            : preview.counts.new + preview.counts.update === 0
              ? t('sh.nothing_to_do')
              : t('sh.ready', { new: preview.counts.new, update: preview.counts.update }),
      }
    }
    if (form.get('token') !== token) {
      return { ...base, stage: 'preview', message: t('sh.changed_since_preview') }
    }
    if (blocking.length > 0) {
      return { ...base, stage: 'preview', message: t('sh.fix_first', { count: blocking.length }) }
    }
    const images = await fetchImages(plan, stored, session)
    const result = await applyPlan(plan, ctx, session, t, images.ids)
    revalidatePath('/[locale]/activities', 'page')
    revalidatePath('/[locale]/activities/[slug]', 'page')
    return {
      ...base,
      stage: 'done',
      preview: null,
      message: t('sh.done', { created: result.created, updated: result.updated }),
      warnings: [
        ...images.failed.map((f) => t('sh.warn_image_failed', { url: f.url, reason: f.reason })),
        ...result.warnings,
      ],
    }
  } catch (error) {
    return { ...empty, message: localizeMessage(errorMessage(error), t) }
  }
}
