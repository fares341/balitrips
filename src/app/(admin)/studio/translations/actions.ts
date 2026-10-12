'use server'

import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'

import { db } from '@/db'
import { translations } from '@/db/schema'
import { locales } from '@/i18n/config'

import arMessages from '../../../../../messages/ar.json'
import enMessages from '../../../../../messages/en.json'
import idMessages from '../../../../../messages/id.json'

import { adminHref } from '../../_lib/admin-path'
import { writeAudit } from '../../_lib/audit'
import { flocalized, freq } from '../../_lib/form'
import { errorMessage, isRedirectError, withOutcome } from '../../_lib/result'
import { requireCapability } from '../../_lib/session'

const LIST = adminHref('/translations')

type Outcome = { ok: string } | { err: string }

/** The bundled catalogues, which are the source of truth until a key is edited here. */
const BUNDLED: Record<string, Record<string, string>> = {
  en: enMessages as Record<string, string>,
  ar: arMessages as Record<string, string>,
  id: idMessages as Record<string, string>,
}

export async function saveTranslation(id: string, form: FormData): Promise<void> {
  const session = await requireCapability('translations.write')
  let outcome: Outcome

  try {
    const values = flocalized(form, 'values')

    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(translations).where(eq(translations.id, id)).limit(1)
      if (!before) throw new Error('That key no longer exists')

      const [after] = await tx
        .update(translations)
        .set({ values })
        .where(eq(translations.id, id))
        .returning()

      await writeAudit(
        {
          actor: session,
          action: 'translation.update',
          entityType: 'translation',
          entityId: id,
          before,
          after: after ?? null,
        },
        tx,
      )
    })

    outcome = { ok: 'Key saved.' }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

export async function createTranslation(form: FormData): Promise<void> {
  const session = await requireCapability('translations.write')
  let outcome: Outcome

  try {
    const key = freq(form, 'key', 'Key').slice(0, 128)
    if (!/^[a-z0-9_.-]+$/i.test(key)) {
      throw new Error('A key may contain letters, digits, dots, underscores and hyphens only')
    }

    const values = flocalized(form, 'values')
    if (values.en === '') throw new Error('The English value is required')

    await db.transaction(async (tx) => {
      const [row] = await tx.insert(translations).values({ key, values }).returning()

      await writeAudit(
        {
          actor: session,
          action: 'translation.create',
          entityType: 'translation',
          entityId: row?.id ?? null,
          before: null,
          after: row ?? null,
        },
        tx,
      )
    })

    outcome = { ok: `Added "${key}".` }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}

/**
 * Pull every key from the bundled catalogues into the database.
 *
 * The JSON files ship with the build; this table is what makes copy
 * editable without a deploy. Import is additive and idempotent — an
 * existing row is never overwritten, so a correction made here is not
 * clobbered by the next import.
 */
export async function importBundledKeys(): Promise<void> {
  const session = await requireCapability('translations.write')
  let outcome: Outcome

  try {
    const englishKeys = Object.keys(BUNDLED.en ?? {})

    const inserted = await db.transaction(async (tx) => {
      const existing = await tx.select({ key: translations.key }).from(translations)
      const known = new Set(existing.map((row) => row.key))

      const rows = englishKeys
        .filter((key) => !known.has(key))
        .map((key) => {
          const values = {} as Record<string, string>
          for (const locale of locales) values[locale] = BUNDLED[locale]?.[key] ?? ''
          return { key: key.slice(0, 128), values: values as Record<'en' | 'ar' | 'id', string> }
        })

      if (rows.length === 0) return 0

      // Chunked: a single INSERT with 600+ rows and a jsonb column each is
      // fine, but the bind-parameter ceiling is not worth discovering later.
      for (let index = 0; index < rows.length; index += 200) {
        await tx.insert(translations).values(rows.slice(index, index + 200))
      }

      await writeAudit(
        {
          actor: session,
          action: 'translation.import',
          entityType: 'translation',
          entityId: null,
          before: { existing: known.size },
          after: { imported: rows.length, total: known.size + rows.length },
        },
        tx,
      )

      return rows.length
    })

    outcome = {
      ok:
        inserted === 0
          ? 'Nothing to import — every bundled key is already in the database.'
          : `Imported ${inserted} key(s) from the bundled catalogues.`,
    }
  } catch (error) {
    if (isRedirectError(error)) throw error
    outcome = { err: errorMessage(error) }
  }

  redirect(withOutcome(LIST, outcome))
}
