import type { Translate } from '../_i18n/index'

/**
 * Pure helpers of the media upload (names, cheap checks) — no database, so
 * the unit suite and the browser-facing code can share them.
 */

const MB = 1024 * 1024
const MAX_UPLOAD_BYTES = Number(process.env.MEDIA_MAX_UPLOAD_BYTES) || 12 * MB

function formatBytes(bytes: number): string {
  return bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

/** Types the pipeline accepts (magic bytes are checked again on the server). */
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export const NAME_MAX = 120

/**
 * "IMG_2034 Ulun-Danu.final.JPG" → "IMG 2034 Ulun Danu.final".
 * The owner picks images by this name, so it keeps what they typed and only
 * drops the path, the extension and the separators cameras/phones add.
 */
export function nameFromFilename(fileName: string | null | undefined): string {
  const base = (fileName ?? '').split(/[\\/]/).pop() ?? ''
  const noExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  const clean = noExt.replace(/[_]+/g, ' ').replace(/-+/g, ' ').replace(/\s+/g, ' ').trim()
  return (clean === '' ? 'image' : clean).slice(0, NAME_MAX)
}

/** Normalise an owner-typed name; empty → null (caller decides the fallback). */
export function cleanName(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX)
  return text === '' ? null : text
}

export type UploadProblem = { code: 'empty' | 'type' | 'size'; message: string }

/** Cheap checks before the bytes are read; the pipeline checks again after. */
export function checkUpload(
  file: { size: number; type: string; name: string },
  t: Translate,
  max: number = MAX_UPLOAD_BYTES,
): UploadProblem | null {
  if (file.size === 0) return { code: 'empty', message: t('media.err_choose_image') }
  if (file.type !== '' && !(UPLOAD_TYPES as readonly string[]).includes(file.type)) {
    return { code: 'type', message: t('mc.err_type', { name: file.name }) }
  }
  if (file.size > max) {
    return {
      code: 'size',
      message: t('media.err_too_large', { size: formatBytes(file.size), max: formatBytes(max) }),
    }
  }
  return null
}
