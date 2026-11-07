import { eq, inArray } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'

import { db } from '@/db'
import { messageOverrides } from '@/db/schema'
import { BUNDLED_MESSAGES } from '@/lib/content/home-content-bundled'
import {
  isBundledKey,
  MESSAGE_LOCALES,
  overrideFor,
  overrideProblem,
  type LocaleText,
  type MessageLocale,
} from '@/lib/content/message-overrides'
import { MESSAGE_OVERRIDES_TAG } from '@/lib/content/message-overrides-server'

import type { Translate } from '../_i18n'
import { writeAudit, type Tx } from './audit'
import type { AdminSession } from './session'

/**
 * Write path of the site text overrides (not a server action module: the
 * screens' actions call it after their own capability check).
 */

const BUNDLED = BUNDLED_MESSAGES as Record<MessageLocale, Record<string, unknown>>

/** Validate one submitted key; throws a message the owner can act on. */
function checked(key: string, values: LocaleText, t: Translate): LocaleText | null {
  if (!isBundledKey(key, BUNDLED)) throw new Error(t('tr2.err_unknown_key', { key }))
  const kept = overrideFor(key, values, BUNDLED)
  if (kept === null) return null
  for (const locale of MESSAGE_LOCALES) {
    const value = kept[locale]
    if (value === undefined) continue
    const base = BUNDLED[locale]?.[key] ?? BUNDLED.en[key]
    const problem = overrideProblem(typeof base === 'string' ? base : '', value)
    if (problem !== null) {
      throw new Error(t(`tr2.err_${problem}`, { key, lang: locale }))
    }
  }
  return kept
}

/**
 * Store the submitted texts of `keys`: changed languages become the override,
 * a key whose texts all match the bundle (or are blank) loses its override.
 */
export async function writeSiteTexts(
  submitted: Record<string, LocaleText>,
  session: AdminSession,
  t: Translate,
  tx: Tx | typeof db = db,
): Promise<number> {
  const keys = Object.keys(submitted)
  if (keys.length === 0) return 0
  const prepared = keys.map((key) => [key, checked(key, submitted[key] ?? {}, t)] as const)

  const before = await tx.select().from(messageOverrides).where(inArray(messageOverrides.key, keys))
  const existing = new Map(before.map((row) => [row.key, row.values]))

  let changed = 0
  for (const [key, values] of prepared) {
    const old = existing.get(key) ?? null
    if (JSON.stringify(old) === JSON.stringify(values)) continue
    changed += 1
    if (values === null) {
      await tx.delete(messageOverrides).where(eq(messageOverrides.key, key))
    } else {
      await tx
        .insert(messageOverrides)
        .values({ key, values, updatedBy: session.userId })
        .onConflictDoUpdate({
          target: messageOverrides.key,
          set: { values, updatedBy: session.userId, updatedAt: new Date() },
        })
    }
    await writeAudit(
      {
        actor: session,
        action: values === null ? 'site_text.reset' : 'site_text.update',
        entityType: 'site_text',
        entityId: null,
        before: { key, values: old },
        after: { key, values },
      },
      tx as Tx,
    )
  }
  return changed
}

/** Drop one key's override (back to the bundled text). */
export async function resetSiteText(key: string, session: AdminSession): Promise<boolean> {
  const rows = await db.delete(messageOverrides).where(eq(messageOverrides.key, key)).returning()
  if (rows.length === 0) return false
  await writeAudit({
    actor: session,
    action: 'site_text.reset',
    entityType: 'site_text',
    entityId: null,
    before: { key, values: rows[0]?.values ?? null },
    after: { key, values: null },
  })
  return true
}

/** After any save: the cached overrides and every public page. */
export function revalidateSiteTexts(): void {
  revalidateTag(MESSAGE_OVERRIDES_TAG, { expire: 0 })
  revalidatePath('/', 'layout')
}

/** Read `t__<key>__<locale>` fields for `keys` from a form. */
export function textsFromForm(form: FormData, keys: readonly string[]): Record<string, LocaleText> {
  const out: Record<string, LocaleText> = {}
  for (const key of keys) {
    const values: LocaleText = {}
    for (const locale of MESSAGE_LOCALES) {
      const raw = form.get(`t__${key}__${locale}`)
      if (typeof raw === 'string') values[locale] = raw
    }
    if (Object.keys(values).length > 0) out[key] = values
  }
  return out
}

/** Current overrides, uncached (Studio screens show the latest save). */
export async function loadSiteTexts(keys?: readonly string[]): Promise<Record<string, LocaleText>> {
  const rows = await db
    .select({ key: messageOverrides.key, values: messageOverrides.values })
    .from(messageOverrides)
    .where(keys ? inArray(messageOverrides.key, [...keys, '']) : undefined)
  return Object.fromEntries(rows.map((row) => [row.key, row.values ?? {}]))
}
