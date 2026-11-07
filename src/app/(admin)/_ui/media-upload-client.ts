/**
 * Browser half of the media upload: shrink big photos before they leave the
 * phone, then post one file at a time with real progress (XHR, because
 * `fetch` still has no upload progress).
 */

export const MAX_EDGE = 2560
/** Files under this size and edge are sent untouched. */
export const SHRINK_ABOVE_BYTES = 2.5 * 1024 * 1024
export const CLIENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

/** Target size keeping the aspect ratio; null when no resize is needed. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge = MAX_EDGE,
): { width: number; height: number } | null {
  const edge = Math.max(width, height)
  if (edge <= maxEdge || edge <= 0) return null
  const scale = maxEdge / edge
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

export function needsShrink(file: { size: number; type: string }): boolean {
  return file.size > SHRINK_ABOVE_BYTES && file.type !== 'image/png'
}

/**
 * Resize/re-encode large JPEG/WebP photos to WebP (quality .86). PNG is kept
 * as is unless it is over the edge limit (it may carry transparency). Any
 * failure returns the original file — the server still validates everything.
 */
export async function shrinkImage(file: File): Promise<File> {
  if (!(CLIENT_TYPES as readonly string[]).includes(file.type)) return file
  if (typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file)
    const target = fitWithin(bitmap.width, bitmap.height)
    if (!target && !needsShrink(file)) {
      bitmap.close()
      return file
    }
    const size = target ?? { width: bitmap.width, height: bitmap.height }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    bitmap.close()
    const type = file.type === 'image/png' ? 'image/png' : 'image/webp'
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.86))
    if (!blob || blob.size >= file.size) return file
    const base = file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '')
    return new File([blob], `${base}.${type === 'image/png' ? 'png' : 'webp'}`, { type })
  } catch {
    return file
  }
}

export interface UploadedItem {
  id: string
  name: string
  url: string
  width: number
  height: number
  alt: string
}

export const MEDIA_API = '/api/studio-media'

export function uploadOne(
  file: File,
  name: string,
  onProgress: (fraction: number) => void,
): Promise<UploadedItem> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', MEDIA_API)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onerror = () => reject(new Error('network'))
    xhr.onload = () => {
      const body = (xhr.response ?? {}) as { item?: UploadedItem; error?: string }
      if (xhr.status === 200 && body.item) resolve(body.item)
      else reject(new Error(body.error ?? `HTTP ${xhr.status}`))
    }
    const form = new FormData()
    form.set('file', file)
    form.set('name', name)
    xhr.send(form)
  })
}
