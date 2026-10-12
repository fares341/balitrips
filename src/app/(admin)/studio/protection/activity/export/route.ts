import { desc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { activityLog, devices, users } from '@/db/schema'

import { writeAudit } from '../../../../_lib/audit'
import { CSV_MAX_ROWS, csvResponse } from '../../../../_lib/csv'
import { requireCapability } from '../../../../_lib/session'
import { activityFilters } from '../filters'

/**
 * تصدير سجل النشاط CSV (الوثيقة 15.2) بنفس فلاتر الصفحة. فيه عناوين IP وبريد
 * المستخدمين، فهو للمدير فقط ويُسجَّل في الـ audit log.
 */
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const session = await requireCapability('customers.export')
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const { where } = activityFilters(params)

  const rows = await db
    .select({
      createdAt: activityLog.createdAt,
      action: activityLog.action,
      email: users.email,
      ip: activityLog.ip,
      browser: devices.browser,
      os: devices.os,
      details: activityLog.details,
    })
    .from(activityLog)
    .leftJoin(users, eq(users.id, activityLog.userId))
    .leftJoin(devices, eq(devices.id, activityLog.deviceId))
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(CSV_MAX_ROWS)

  await writeAudit({
    actor: session,
    action: 'activity.export_csv',
    entityType: 'user',
    entityId: session.userId,
    before: null,
    after: { rows: rows.length, filters: params },
  })

  return csvResponse(
    'activity',
    ['created_at', 'action', 'user_email', 'ip', 'browser', 'os', 'details'],
    rows.map((row) => [
      row.createdAt,
      row.action,
      row.email,
      row.ip,
      row.browser,
      row.os,
      row.details,
    ]),
  )
}
