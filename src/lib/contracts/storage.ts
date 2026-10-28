/**
 * Where operator contracts live: private storage only (Spaces private bucket,
 * or the local private volume). Never `public/`, so no URL serves a contract;
 * the Studio route `activities/[id]/contract` streams it to staff.
 *
 * Development and CI without private storage keep it under the OS temp folder
 * (outside the project, so outside anything the site serves). Production
 * without private storage refuses the upload.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { isPrivateStorageAvailable, readPrivateObject, uploadPrivate } from '@/lib/storage'

export const MAX_CONTRACT_BYTES = 15 * 1024 * 1024

export class ContractStorageMissing extends Error {}

function devRoot(): string {
  return path.join(tmpdir(), 'bali-trips-dev-private')
}

function devPath(key: string): string | null {
  if (!/^contracts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.pdf$/.test(key)) return null
  return path.join(devRoot(), key)
}

export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'
}

export async function storeContract(key: string, bytes: Uint8Array): Promise<void> {
  if (isPrivateStorageAvailable()) {
    await uploadPrivate({ key, body: bytes, contentType: 'application/pdf' })
    return
  }
  if (process.env.NODE_ENV === 'production' && process.env.LIVE_MODE === 'true') {
    throw new ContractStorageMissing('no private storage')
  }
  const file = devPath(key)
  if (file === null) throw new Error('bad contract key')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { mode: 0o600 })
}

export async function readContract(key: string): Promise<Uint8Array | null> {
  if (isPrivateStorageAvailable()) return readPrivateObject(key)
  const file = devPath(key)
  if (file === null) return null
  try {
    return new Uint8Array(await readFile(file))
  } catch {
    return null
  }
}
