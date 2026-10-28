import { eq } from 'drizzle-orm'
import { notFound } from 'next/navigation'

import { db } from '@/db'
import { activityOperators } from '@/db/schema'
import { can } from '@/lib/auth/roles'
import { readContract } from '@/lib/contracts/storage'

import { writeAudit } from '../../../../_lib/audit'
import { isUuid } from '../../../../_lib/form'
import { requireCapability } from '../../../../_lib/session'

/**
 * The operator contract, for staff only (owner, Oct 2026). Streamed from
 * private storage — there is no public URL for it. Every download is audited.
 */
export const dynamic = 'force-dynamic'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('content.write')
  if (!can(session.role, 'prices.write')) notFound()
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [row] = await db
    .select({ key: activityOperators.contractKey, filename: activityOperators.contractFilename })
    .from(activityOperators)
    .where(eq(activityOperators.activityId, id))
    .limit(1)
  if (!row?.key) notFound()
  const bytes = await readContract(row.key)
  if (!bytes) notFound()
  await writeAudit({
    actor: session,
    action: 'activity.contract_download',
    entityType: 'activity',
    entityId: id,
  })
  const name = (row.filename ?? 'contract.pdf').replace(/[^\w.\- ]+/g, '_')
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
