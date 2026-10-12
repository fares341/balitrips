import { and, eq, gte, ilike, lte, or, type SQL } from 'drizzle-orm'

import { activityLog, users } from '@/db/schema'
import { isActivityAction } from '@/lib/security/activity'

import { isUuid } from '../../../_lib/form'
import { param } from '../../../_lib/result'

type Params = Record<string, string | string[] | undefined>

const DAY = /^\d{4}-\d{2}-\d{2}$/
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

/** فلاتر سجل النشاط — مشتركة مع تصدير CSV. */
export function activityFilters(params: Params) {
  const q = param(params, 'q')
  const action = param(params, 'action')
  const user = param(params, 'user')
  const from = param(params, 'from')
  const to = param(params, 'to')

  const filters: SQL[] = []
  if (q) {
    const like = `%${escapeLike(q)}%`
    const match = or(ilike(users.email, like), ilike(activityLog.ip, like))
    if (match) filters.push(match)
  }
  if (action && isActivityAction(action)) filters.push(eq(activityLog.action, action))
  if (user && isUuid(user)) filters.push(eq(activityLog.userId, user))
  if (from && DAY.test(from))
    filters.push(gte(activityLog.createdAt, new Date(`${from}T00:00:00Z`)))
  if (to && DAY.test(to)) filters.push(lte(activityLog.createdAt, new Date(`${to}T23:59:59Z`)))
  return { q, action, user, from, to, where: filters.length > 0 ? and(...filters) : undefined }
}
