import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

/**
 * The one encryption scheme for server-only third-party secrets: the
 * ad-platform tokens (Phase 5, `integration_secrets`) and supplier connection
 * keys and webhook signing secrets (Phase 6, `supplier_integrations`).
 *
 * AES-256-GCM with a key that never touches the database:
 * `INTEGRATION_SECRET_KEY` if set, otherwise derived from `BETTER_AUTH_SECRET`.
 * Pure (no database), so it can be unit-tested and shared.
 */

type Env = Record<string, string | undefined>

export function integrationEncryptionKey(env: Env = process.env): Buffer | null {
  const raw = env.INTEGRATION_SECRET_KEY?.trim() || env.BETTER_AUTH_SECRET?.trim()
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
