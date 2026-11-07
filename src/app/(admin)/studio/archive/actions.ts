'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { MAP_PLACES_TAG } from '@/lib/map/cached'

import { adminHref } from '../../_lib/admin-path'
import { isArchiveKind, restoreArchived } from '../../_lib/archive'
import { writeAudit } from '../../_lib/audit'
import { getAdminI18n } from '../../_lib/i18n'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/archive')

/** Restore one archived record (it comes back hidden; publish it yourself). */
export async function restoreFromArchive(form: FormData): Promise<void> {
  const kind = form.get('kind')
  const id = String(form.get('id') ?? '')
  const session = await requireCapability(
    kind === 'suppliers'
      ? 'suppliers.write'
      : kind === 'plans'
        ? 'config.write'
        : kind === 'media'
          ? 'media.upload'
          : 'content.write',
  )
  const { t } = await getAdminI18n()
  let outcome: { ok: string } | { err: string }
  try {
    if (!isArchiveKind(kind) || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error(t('arc.err_gone'))
    await db.transaction(async (tx) => {
      if (!(await restoreArchived(kind, id, tx))) throw new Error(t('arc.err_gone'))
      await writeAudit(
        {
          actor: session,
          action: 'archive.restore',
          entityType: kind,
          entityId: id,
          before: { archived: true },
          after: { archived: false },
        },
        tx,
      )
    })
    outcome = { ok: t('arc.ok_restored') }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }
  revalidateTag(MAP_PLACES_TAG, { expire: 0 })
  revalidatePath('/', 'layout')
  redirect(withOutcome(LIST, outcome))
}
