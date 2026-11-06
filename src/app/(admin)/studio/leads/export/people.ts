import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { coupons, leadContacts } from '@/db/schema'
import { leadOrdersSql } from '@/lib/leads/capture'

import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import type { AdminSession } from '../../../_lib/session'
import { peopleWhere } from '../people-tab'

/**
 * «العملاء المحتملون» as CSV, with the screen's filters. Personal data:
 * `customers.export` (checked by the caller) and audited. A mailing list must
 * use only rows whose consent column says yes.
 */
export async function exportPeople(
  session: AdminSession,
  params: Record<string, string>,
): Promise<Response> {
  const rows = await db
    .select({ lead: leadContacts, code: coupons.code, orders: leadOrdersSql })
    .from(leadContacts)
    .leftJoin(coupons, eq(coupons.id, leadContacts.couponId))
    .where(peopleWhere(params))
    .orderBy(desc(leadContacts.createdAt))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'leads.export_people_csv',
    entityType: 'lead_contact',
    entityId: null,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'potential-customers',
    [
      'created_at',
      'name',
      'phone',
      'email',
      'source',
      'language',
      'country',
      'whatsapp_consent',
      'whatsapp_consent_at',
      'email_consent',
      'email_consent_at',
      'consent_text',
      'coupon',
      'orders',
    ],
    rows.map(({ lead, code, orders }) => [
      lead.createdAt,
      lead.name,
      lead.phone,
      lead.email,
      lead.source,
      lead.locale,
      lead.country,
      lead.whatsappConsent ? 'yes' : 'no',
      lead.whatsappConsentAt,
      lead.emailConsent ? 'yes' : 'no',
      lead.emailConsentAt,
      lead.consentText,
      code,
      orders,
    ]),
  )
}
