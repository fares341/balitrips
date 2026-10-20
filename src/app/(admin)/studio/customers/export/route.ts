import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { orders, users } from '@/db/schema'

import { writeAudit } from '../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../_lib/csv'
import { requireCapability } from '../../../_lib/session'
import { customerFilters } from '../filters'

/**
 * Phase 4: the file carries each person's marketing consent, and the list's
 * "Agreed to offers" filter (`consent=yes`) applies here too.
 *
 * تصدير قائمة المستخدمين CSV (الوثيقة 21.1/21.2) بنفس فلاتر الصفحة.
 * بيانات شخصية: للمدير فقط (`customers.export`)، وكل تصدير يُسجَّل في الـ audit log.
 * لا كلمات مرور ولا رموز — أعمدة الملف مذكورة صراحةً أدناه.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireCapability('customers.export')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { where } = customerFilters(params)

  const rows = await db
    .select({
      email: users.email,
      name: users.name,
      phone: users.phone,
      country: users.country,
      locale: users.locale,
      role: users.role,
      status: users.status,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
      orderCount: db.$count(orders, eq(orders.userId, users.id)),
      marketingConsent: users.marketingConsent,
      marketingConsentAt: users.marketingConsentAt,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'customers.export_csv',
    entityType: 'user',
    entityId: session.userId,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'customers',
    [
      'email',
      'name',
      'phone',
      'country',
      'language',
      'role',
      'status',
      'email_verified_at',
      'created_at',
      'orders',
      // Phase 4: whether this person agreed to offers. For a mailing list,
      // export with "Agreed to offers" ticked so only those rows are in it.
      'marketing_consent',
      'marketing_consent_at',
    ],
    rows.map((row) => [
      row.email,
      row.name,
      row.phone,
      row.country,
      row.locale,
      row.role,
      row.status,
      row.emailVerifiedAt,
      row.createdAt,
      row.orderCount,
      row.marketingConsent ? 'yes' : 'no',
      row.marketingConsentAt,
    ]),
  )
}
