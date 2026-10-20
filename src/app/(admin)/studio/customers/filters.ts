import { and, eq, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'

import { users } from '@/db/schema'
import { ROLES } from '@/lib/auth/roles'
import { isSmartList, smartListWhere } from '@/lib/crm/queries'
import { normalizeTag } from '@/lib/crm/stage'

import { isUuid } from '../../_lib/form'
import { param } from '../../_lib/result'

type Params = Record<string, string | string[] | undefined>

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

/** فلاتر قائمة العملاء — مشتركة مع تصدير CSV كي يطابق الملف ما يُرى. */
export function customerFilters(params: Params) {
  const q = param(params, 'q')
  const role = param(params, 'role')
  const state = param(params, 'state')
  // Phase 4: tag, smart list, marketing consent, assigned staff member.
  const tag = normalizeTag(param(params, 'tag') ?? '')
  const rawList = param(params, 'list')
  const list = isSmartList(rawList) ? rawList : null
  const consent = param(params, 'consent') === 'yes' ? 'yes' : null
  const rawAssigned = param(params, 'assigned')
  const assigned = rawAssigned !== null && isUuid(rawAssigned) ? rawAssigned : null

  const filters: SQL[] = []
  if (q) {
    const like = `%${escapeLike(q)}%`
    const match = or(ilike(users.email, like), ilike(users.name, like), ilike(users.phone, like))
    if (match) filters.push(match)
  }
  if (role && ROLES.includes(role as (typeof ROLES)[number])) filters.push(eq(users.role, role))
  filters.push(state === 'deleted' ? isNotNull(users.deletedAt) : isNull(users.deletedAt))
  if (tag) {
    filters.push(
      sql`exists (select 1 from customer_tags ct where ct.user_id = ${users.id} and ct.tag = ${tag})`,
    )
  }
  if (list) filters.push(smartListWhere(list))
  if (consent) filters.push(eq(users.marketingConsent, true))
  if (assigned) filters.push(eq(users.assignedToUserId, assigned))
  return { q, role, state, tag, list, consent, assigned, where: and(...filters) }
}
