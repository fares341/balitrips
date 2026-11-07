import type { NextRequest } from 'next/server'

import { and, eq } from 'drizzle-orm'

import { db } from '@/db'
import { itineraryDocuments } from '@/db/schema'

import { requireCapability } from '../../../../_lib/session'
import { readStoredPdf, uploadPdfCore } from '../../pdf-upload'

/**
 * «ملف PDF» tab, drag & drop upload with a progress bar (XHR can report
 * upload progress; a server action cannot). Same checks as the form action:
 * `content.write`, size from settings, MIME + `%PDF-`, private storage.
 * Same-origin only — server actions check the Origin for us, a route must
 * do it itself.
 */
export const dynamic = 'force-dynamic'

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!origin || !host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return Response.json({ err: 'origin' }, { status: 403 })
  const { id } = await params
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ err: 'form' }, { status: 400 })
  }
  const outcome = await uploadPdfCore(id, form)
  return Response.json(outcome, { status: 'ok' in outcome ? 200 : 422 })
}

/** Staff preview / download of one stored file (`?doc=<id>`), never cached. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireCapability('content.read')
  const { id } = await params
  const docId = request.nextUrl.searchParams.get('doc') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(docId) || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new Response('Not found', { status: 404 })
  }
  const [doc] = await db
    .select({
      objectKey: itineraryDocuments.objectKey,
      downloadFilename: itineraryDocuments.downloadFilename,
    })
    .from(itineraryDocuments)
    .where(and(eq(itineraryDocuments.id, docId), eq(itineraryDocuments.itineraryId, id)))
    .limit(1)
  if (!doc) return new Response('Not found', { status: 404 })
  const bytes = await readStoredPdf(doc.objectKey)
  if (bytes === null) return new Response('File missing from storage', { status: 404 })
  const name = (doc.downloadFilename ?? 'itinerary.pdf').replace(/[^\w.\-]+/g, '_')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
