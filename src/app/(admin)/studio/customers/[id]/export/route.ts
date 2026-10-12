import { eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'

import { writeAudit } from '../../../../_lib/audit'
import { buildDataExport, exportFilename } from '../../../../_lib/data-export'
import { isUuid } from '../../../../_lib/form'
import { requireCapability } from '../../../../_lib/session'

/**
 * Subject access download.
 *
 * A route handler rather than a Server Action because the browser has to
 * *navigate* to a file — an action can only return data, and a JSON export is
 * something an operator forwards to the person who asked for it.
 *
 * Running an export is itself a privileged read of somebody's whole life with
 * this business, so it is audited exactly like a mutation. That row is the
 * answer to "who pulled this customer's file, and when", which is a question
 * a regulator asks and an internal investigation asks more often.
 *
 * `customers.export` is admin-only. Staff can read the customer list and see
 * a session count; they cannot produce a portable copy of everything.
 */

export const dynamic = 'force-dynamic'

/** An authorised export must never sit in a shared cache. */
const HEADERS_BASE = {
  'Cache-Control': 'private, no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireCapability('customers.export')
  const { id } = await params

  // A malformed id would otherwise reach the driver as an invalid uuid and
  // surface as a 500. There is nothing at this path for a bad id.
  if (!isUuid(id)) return new Response(null, { status: 404, headers: HEADERS_BASE })

  const [subject] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (!subject) return new Response(null, { status: 404, headers: HEADERS_BASE })

  const payload = await buildDataExport(id, `${session.email} (${session.role})`)

  await writeAudit({
    actor: session,
    action: 'user.export',
    entityType: 'user',
    entityId: id,
    before: null,
    after: {
      subjectEmail: subject.email,
      orders: payload.orders.length,
      sessions: payload.sessions.length,
      generatedAt: payload.meta.generatedAt,
    },
  })

  // Pretty-printed on purpose: the recipient is usually a person reading it,
  // or a lawyer attaching it to a response, not a parser.
  const body = JSON.stringify(payload, null, 2)

  return new Response(body, {
    status: 200,
    headers: {
      ...HEADERS_BASE,
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFilename(id)}"`,
    },
  })
}
