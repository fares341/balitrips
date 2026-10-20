import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { integrationSecrets } from '@/db/schema'

/**
 * Server-only tokens for the ad platforms' server APIs.
 *
 * Encrypted at rest (AES-256-GCM) with a key that never touches the database:
 * `INTEGRATION_SECRET_KEY` if set, otherwise derived from `BETTER_AUTH_SECRET`.
 * A database dump alone does not reveal the tokens. The Studio form can only
 * replace or remove a token; it never shows one back (only its last four
 * characters).
 */
export const SECRET_KEYS = ['meta_capi_token', 'tiktok_events_token'] as const
export type SecretKey = (typeof SECRET_KEYS)[number]

function encryptionKey(): Buffer | null {
  const raw = process.env.INTEGRATION_SECRET_KEY?.trim() || process.env.BETTER_AUTH_SECRET?.trim()
  if (!raw) return null
  return createHash('sha256').update(`bali-integration-secrets:${raw}`).digest()
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    'v1',
    iv.toString('base64url'),
    tag.toString('base64url'),
    data.toString('base64url'),
  ].join(':')
}

export function decryptSecret(stored: string, key: Buffer): string | null {
  const [version, iv, tag, data] = stored.split(':')
  if (version !== 'v1' || !iv || !tag || data === undefined) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

export async function readSecret(name: SecretKey): Promise<string | null> {
  const key = encryptionKey()
  if (key === null) return null
  const [row] = await db
    .select({ ciphertext: integrationSecrets.ciphertext })
    .from(integrationSecrets)
    .where(eq(integrationSecrets.key, name))
    .limit(1)
  return row ? decryptSecret(row.ciphertext, key) : null
}

/** Which tokens are stored, with their last four characters. */
export async function secretHints(): Promise<Partial<Record<SecretKey, string>>> {
  const rows = await db
    .select({ key: integrationSecrets.key, hint: integrationSecrets.hint })
    .from(integrationSecrets)
  const out: Partial<Record<SecretKey, string>> = {}
  for (const row of rows) {
    if ((SECRET_KEYS as readonly string[]).includes(row.key)) {
      out[row.key as SecretKey] = row.hint ?? '••••'
    }
  }
  return out
}

export async function writeSecret(
  name: SecretKey,
  plain: string | null,
  actorId: string,
): Promise<void> {
  if (plain === null || plain.trim() === '') {
    await db.delete(integrationSecrets).where(eq(integrationSecrets.key, name))
    return
  }
  const key = encryptionKey()
  if (key === null) throw new Error('No encryption key is configured on the server')
  const value = plain.trim()
  const ciphertext = encryptSecret(value, key)
  const hint = value.slice(-4)
  await db
    .insert(integrationSecrets)
    .values({ key: name, ciphertext, hint, updatedByActorId: actorId })
    .onConflictDoUpdate({
      target: integrationSecrets.key,
      set: { ciphertext, hint, updatedByActorId: actorId, updatedAt: new Date() },
    })
}
