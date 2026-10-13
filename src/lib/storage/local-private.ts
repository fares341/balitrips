/**
 * Private files without object storage (single-host production).
 *
 * When `PRIVATE_STORAGE_DIR` is set and Spaces is NOT configured, paid
 * documents (itinerary PDFs, custom plans, receipts) are kept on a local
 * volume shared by the app and the worker — never under `public/`, so there
 * is no URL for them. They are only ever read by the server and delivered
 * watermarked, exactly like the Spaces path.
 *
 * Spaces always wins when both are configured.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { isStorageConfigured, presignedGet } from './spaces'

/** Upper bound for anything we read back — itinerary PDFs are a few MB. */
const MAX_READ_BYTES = 30 * 1024 * 1024

export function localPrivateRoot(): string | null {
  if (isStorageConfigured()) return null
  const dir = process.env.PRIVATE_STORAGE_DIR?.trim()
  return dir ? path.resolve(dir) : null
}

/** Spaces, or the local private volume: somewhere paid files can live. */
export function isPrivateStorageAvailable(): boolean {
  return isStorageConfigured() || localPrivateRoot() !== null
}

/** Key → absolute path inside the root, or null on any traversal attempt. */
function resolveKey(root: string, key: string): string | null {
  const clean = key.replace(/^\/+/, '')
  if (
    clean === '' ||
    clean.split('/').some((part) => part === '' || part === '.' || part === '..')
  ) {
    return null
  }
  const file = path.normalize(path.join(root, clean))
  return file.startsWith(root + path.sep) ? file : null
}

export async function writeLocalPrivate(key: string, body: Uint8Array | string): Promise<number> {
  const root = localPrivateRoot()
  if (root === null) throw new Error('PRIVATE_STORAGE_DIR is not set')
  const file = resolveKey(root, key)
  if (file === null) throw new Error(`Refusing private key ${key}`)
  const bytes = typeof body === 'string' ? Buffer.from(body, 'utf8') : body
  await mkdir(path.dirname(file), { recursive: true })
  // Write-then-rename: a reader never sees half a PDF.
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, bytes, { mode: 0o600 })
  await rename(tmp, file)
  return bytes.byteLength
}

/**
 * Read a private object from wherever it lives (Spaces or the local volume).
 * Null when missing, too large, or no private storage is configured.
 */
export async function readPrivateObject(key: string): Promise<Uint8Array | null> {
  const clean = key.replace(/^\/+/, '')
  if (isStorageConfigured()) {
    const response = await fetch(presignedGet(clean, { expiresInSeconds: 60 }), {
      cache: 'no-store',
    })
    if (!response.ok) {
      console.error('[storage] private fetch failed', response.status, clean)
      return null
    }
    const buffer = new Uint8Array(await response.arrayBuffer())
    return buffer.byteLength > MAX_READ_BYTES ? null : buffer
  }
  const root = localPrivateRoot()
  if (root === null) return null
  const file = resolveKey(root, clean)
  if (file === null) return null
  try {
    const buffer = new Uint8Array(await readFile(file))
    return buffer.byteLength > MAX_READ_BYTES ? null : buffer
  } catch {
    return null
  }
}
