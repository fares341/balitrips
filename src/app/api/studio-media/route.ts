/**
 * Studio media endpoint for the bulk uploader and the <MediaPicker>.
 *
 *   GET  ?q=&limit=   newest-first images, searchable by name / alt / file
 *   POST multipart    one file (+ optional name) → the shared upload path
 *
 * Same gates as the Studio pages (elevated role, capability, second factor),
 * answered as JSON statuses instead of a 404 page. POST also requires a
 * same-origin request, since it accepts bytes from outside.
 */

import { and, desc, ilike, isNull, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { media } from '@/db/schema'
import { mediaUrl } from '@/lib/content/queries'
import { can, isElevated } from '@/lib/auth/roles'
import type { Capability } from '@/lib/auth/roles'
import { getAdminI18n } from '@/app/(admin)/_lib/i18n'
import { ingestUpload } from '@/app/(admin)/_lib/media-upload'
import { getAdminSession, twoFactorGate } from '@/app/(admin)/_lib/session'
import { flocalizedOrNull } from '@/app/(admin)/_lib/form'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

async function gate(capability: Capability) {
  const session = await getAdminSession()
  if (session === null)
    return { error: NextResponse.json({ error: 'signed_out' }, { status: 401 }) }
  if (!isElevated(session.role) || !can(session.role, capability)) {
    return { error: NextResponse.json({ error: 'not_found' }, { status: 404 }) }
  }
  if ((await twoFactorGate(session)) !== 'satisfied') {
    return { error: NextResponse.json({ error: 'two_factor_required' }, { status: 403 }) }
  }
  return { session }
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin && origin !== 'null') {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
    try {
      return new URL(origin).host === host
    } catch {
      return false
    }
  }
  return request.headers.get('sec-fetch-site') === 'same-origin'
}

export interface PickerApiItem {
  id: string
  name: string
  url: string
  width: number
  height: number
  alt: string
}

export async function GET(request: Request): Promise<NextResponse> {
  const { error } = await gate('admin.access')
  if (error) return error

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 60, 1), 200)

  const filters = [isNull(media.deletedAt)]
  if (q) {
    const like = `%${q}%`
    const match = or(
      ilike(media.name, like),
      ilike(media.objectKey, like),
      sql`${media.alt} ->> 'ar' ilike ${like}`,
      sql`${media.alt} ->> 'en' ilike ${like}`,
    )
    if (match) filters.push(match)
  }

  const rows = await db
    .select({
      id: media.id,
      name: media.name,
      objectKey: media.objectKey,
      width: media.width,
      height: media.height,
      alt: media.alt,
    })
    .from(media)
    .where(and(...filters))
    .orderBy(desc(media.createdAt))
    .limit(limit)

  const items: PickerApiItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name ?? row.objectKey.split('/').pop() ?? row.id,
    url: mediaUrl(row.objectKey),
    width: row.width,
    height: row.height,
    alt: row.alt?.ar || row.alt?.en || '',
  }))
  return NextResponse.json({ items }, { headers: NO_STORE })
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { session, error } = await gate('media.upload')
  if (error) return error
  const { t } = await getAdminI18n()

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: t('mc.err_bad_request') }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: t('media.err_choose_image') }, { status: 400 })
  }

  try {
    const nameField = form.get('name')
    const row = await ingestUpload({
      file,
      session,
      t,
      name: typeof nameField === 'string' ? nameField : null,
      alt: flocalizedOrNull(form, 'alt'),
    })
    const item: PickerApiItem = {
      id: row.id,
      name: row.name,
      url: mediaUrl(row.objectKey),
      width: row.width,
      height: row.height,
      alt: '',
    }
    return NextResponse.json({ item }, { headers: NO_STORE })
  } catch (failure) {
    const message = failure instanceof Error ? failure.message : String(failure)
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
