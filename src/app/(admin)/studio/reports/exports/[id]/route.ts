import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'

import { db } from '@/db'
import { reportExports } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import {
  contentDisposition,
  isStorageConfigured,
  localPrivateRoot,
  presignedGet,
  readPrivateObject,
} from '@/lib/storage'

import { requireCapability } from '../../../../_lib/session'

/** Download a rendered report PDF: its requester, or an admin. */
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('orders.read')
  const { id } = await params
  if (!UUID.test(id)) return new NextResponse(null, { status: 404, headers: NO_STORE })
  const [row] = await db.select().from(reportExports).where(eq(reportExports.id, id)).limit(1)
  if (
    !row ||
    row.status !== 'ready' ||
    !row.objectKey ||
    (row.requestedBy !== session.userId && !can(session.role, 'roles.write'))
  ) {
    return new NextResponse(null, { status: 404, headers: NO_STORE })
  }
  const filename = `report-${row.report}-${row.createdAt.toISOString().slice(0, 10)}.pdf`
  if (!isStorageConfigured()) {
    const bytes = localPrivateRoot() === null ? null : await readPrivateObject(row.objectKey)
    if (bytes === null) return new NextResponse(null, { status: 404, headers: NO_STORE })
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        ...NO_STORE,
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition(filename),
      },
    })
  }
  const url = presignedGet(row.objectKey, {
    downloadFilename: filename,
    contentType: 'application/pdf',
    expiresInSeconds: 60,
  })
  return NextResponse.redirect(url, { headers: NO_STORE })
}
