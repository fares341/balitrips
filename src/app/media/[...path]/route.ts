/**
 * GET /media/<...path> — يخدم الوسائط المرفوعة محلياً حين لا يوجد تخزين Spaces.
 *
 * بلا Spaces يكتب `pipeline.ts` (الصور ودرجاتها) ورفع فيديو الأماكن إلى
 * `public/media/` — وهو في الإنتاج المجلد `media_data` في docker-compose.
 * لكن خادم Next المستقل (standalone) لا يخدم من `public/` إلا ما كان موجوداً
 * وقت البناء؛ فكل صورة رُفعت بعد البناء كانت 404. هذا المسار يخدمها.
 *
 *  - Spaces مُعدّ: 404 دائماً — الروابط حينها تشير للـ CDN لا لهنا.
 *  - فقط الأنواع التي يكتبها خط الرفع: avif/webp/jpg/png وmp4/webm. ملفات PDF
 *    خاصة وتُخزَّن خارج `media/` (itineraries/، custom-trips/) ولا تُخدم هنا.
 *  - آمن من path traversal: كل مقطع يُفحص، والمسار النهائي يجب أن يبقى داخل
 *    `public/media`.
 *  - المفاتيح لا تتغير محتوياتها (معرّف الوسيط/عرض الدرجة أو UUID): تخزين
 *    مؤقت طويل `immutable`.
 *  - Range للفيديو (Safari يرفض تشغيل mp4 بدونه).
 *
 * لا يمر بـ proxy.ts: الـ matcher يستثني كل مسار فيه نقطة (امتداد ملف).
 */

import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'

import { isStorageConfigured } from '@/lib/storage'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const CONTENT_TYPES: Record<string, string> = {
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

const SEGMENT = /^[A-Za-z0-9_-][A-Za-z0-9._-]{0,127}$/

const CACHE = 'public, max-age=31536000, immutable'

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function resolveFile(segments: readonly string[]) {
  if (segments.length === 0 || segments.length > 6) return null
  if (!segments.every((segment) => SEGMENT.test(segment) && !segment.includes('..'))) return null

  const contentType = CONTENT_TYPES[path.extname(segments[segments.length - 1] ?? '').toLowerCase()]
  if (contentType === undefined) return null

  const root = path.join(process.cwd(), 'public', 'media')
  const file = path.resolve(root, ...segments)
  if (!file.startsWith(root + path.sep)) return null

  try {
    const info = await stat(file)
    if (!info.isFile()) return null
    return { file, contentType, size: info.size, mtime: info.mtime }
  } catch {
    return null
  }
}

/** One `bytes=start-end` range (the only form browsers send for media). */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (header === null) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart = '', rawEnd = ''] = match
  if (rawStart === '' && rawEnd === '') return null
  let start: number
  let end: number
  if (rawStart === '') {
    // suffix: the last N bytes
    const length = Number(rawEnd)
    start = Math.max(0, size - length)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1)
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size) {
    return { start: -1, end: -1 }
  }
  return { start, end }
}

function stream(file: string, start?: number, end?: number): ReadableStream {
  return Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
}

async function serve(
  request: Request,
  params: Promise<{ path: string[] }>,
  head: boolean,
): Promise<Response> {
  if (isStorageConfigured()) return notFound()
  const { path: segments } = await params
  const found = await resolveFile(segments)
  if (found === null) return notFound()

  const etag = `W/"${found.size.toString(16)}-${found.mtime.getTime().toString(16)}"`
  const base = {
    'Content-Type': found.contentType,
    'Cache-Control': CACHE,
    'Last-Modified': found.mtime.toUTCString(),
    ETag: etag,
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
  }

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: base })
  }

  const range = parseRange(request.headers.get('range'), found.size)
  if (range !== null) {
    if (range.start < 0) {
      return new Response(null, {
        status: 416,
        headers: { ...base, 'Content-Range': `bytes */${found.size}` },
      })
    }
    return new Response(head ? null : stream(found.file, range.start, range.end), {
      status: 206,
      headers: {
        ...base,
        'Content-Range': `bytes ${range.start}-${range.end}/${found.size}`,
        'Content-Length': String(range.end - range.start + 1),
      },
    })
  }

  return new Response(head ? null : stream(found.file), {
    status: 200,
    headers: { ...base, 'Content-Length': String(found.size) },
  })
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return serve(request, params, false)
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  return serve(request, params, true)
}
