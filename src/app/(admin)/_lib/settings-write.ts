import { sql } from 'drizzle-orm'

import { db } from '@/db'
import { siteSettings } from '@/db/schema'

import { writeAudit, type Tx } from './audit'
import type { AdminSession } from './session'
import {
  parseSetting,
  readSetting,
  SETTING_DEFAULTS,
  type SettingKey,
  type SettingsShape,
} from './settings'

/**
 * Read-modify-write of one setting with validation and an audit row (the
 * «محتوى الموقع» screens each change one part of `pageContent`). Not a
 * server-action module: callers check the capability first.
 */
export async function updateSetting<K extends SettingKey>(
  key: K,
  change: (current: SettingsShape[K]) => SettingsShape[K],
  session: AdminSession,
  runner: Tx | typeof db = db,
): Promise<SettingsShape[K]> {
  const current = await readSetting(key)
  const value = parseSetting(key, change(structuredClone(current)))
  await runner
    .insert(siteSettings)
    .values({ key, value, updatedByActorId: session.userId })
    .onConflictDoUpdate({
      target: siteSettings.key,
      set: { value, updatedByActorId: session.userId, updatedAt: sql`now()` },
    })
  await writeAudit(
    {
      actor: session,
      action: 'config.update',
      entityType: 'setting',
      entityId: null,
      before: { [key]: current ?? SETTING_DEFAULTS[key] },
      after: { [key]: value },
    },
    runner as Tx,
  )
  return value
}
