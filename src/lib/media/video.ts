import { isStorageConfigured, publicUrl, uploadPublic } from '@/lib/storage'

/**
 * Public video uploads (place videos, home hero clips): the file's real
 * signature decides the type — the extension and the declared type can lie.
 */

export const MAX_VIDEO_BYTES = 24 * 1024 * 1024
export const VIDEO_TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm' }

export function videoKind(bytes: Uint8Array): 'mp4' | 'webm' | null {
  if (bytes.length > 12 && new TextDecoder().decode(bytes.slice(4, 8)) === 'ftyp') return 'mp4'
  if (
    bytes.length > 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'webm'
  return null
}

/**
 * Store a public video under `key` and return its URL: Spaces when
 * configured, else public/media (served by src/app/media/[...path]).
 */
export async function storePublicVideo(
  key: string,
  bytes: Uint8Array,
  kind: 'mp4' | 'webm',
): Promise<string> {
  if (isStorageConfigured()) {
    await uploadPublic({ key, body: bytes, contentType: `video/${kind}` })
    return publicUrl(key)
  }
  const { mkdir, writeFile } = await import('node:fs/promises')
  const path = await import('node:path')
  const target = path.join(process.cwd(), 'public', key)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, bytes)
  return `/${key}`
}
