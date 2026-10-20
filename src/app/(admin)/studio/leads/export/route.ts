import { desc, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { db } from '@/db'
import { customTripRequests, users } from '@/db/schema'

import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'

/**
 * Phase 4: custom-trip requests (leads) as CSV. Personal data, so admin only
 * (`customers.export`) and audited. Includes whether the account behind the
 * request agreed to offers — a mailing list must use only the "yes" rows.
 */
export const dynamic = 'force-dynamic'

const owner = alias(users, 'lead_owner')
const assignee = alias(users, 'lead_assignee')

export async function GET() {
  const session = await requireCapability('customers.export')
  const rows = await db
    .select({
      request: customTripRequests,
      marketingConsent: owner.marketingConsent,
      assigneeEmail: assignee.email,
    })
    .from(customTripRequests)
    .leftJoin(owner, eq(owner.id, customTripRequests.userId))
    .leftJoin(assignee, eq(assignee.id, customTripRequests.assignedToUserId))
    .orderBy(desc(customTripRequests.createdAt))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'leads.export_csv',
    entityType: 'custom_trip_request',
    entityId: null,
    before: null,
    after: { rows: rows.length },
  })

  return csvResponse(
    'leads',
    [
      'created_at',
      'status',
      'name',
      'email',
      'phone',
      'start_date',
      'end_date',
      'travellers',
      'budget',
      'quote_minor',
      'quote_currency',
      'paid',
      'assigned_to',
      'marketing_consent',
    ],
    rows.map(({ request, marketingConsent, assigneeEmail }) => [
      request.createdAt,
      request.status,
      request.name,
      request.email,
      request.phone,
      request.startDate,
      request.endDate,
      request.travellers,
      request.budgetTier,
      request.quoteMinor,
      request.quoteCurrency,
      request.paidOrderId === null ? 'no' : 'yes',
      assigneeEmail,
      marketingConsent ? 'yes' : 'no',
    ]),
  )
}
