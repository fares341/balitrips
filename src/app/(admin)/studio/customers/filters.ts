import { and, eq, ilike, isNotNull, isNull, or, type SQL } from 'drizzle-orm'

import { users } from '@/db/schema'
import { ROLES } from '@/lib/auth/roles'

import { param } from '../../_lib/result'

type Params = Record<string, string | string[] | undefined>

const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`)

/** فلاتر قائمة العملاء — مشتركة مع تصدير CSV كي يطابق الملف ما يُرى. */
export function customerFilters(params: Params) {
  const q = param(params, 'q')
  const role = param(params, 'role')
  const state = param(params, 'state')

  const filters: SQL[] = []
  if (q) {
    const like = `%${escapeLike(q)}%`
    const match = or(ilike(users.email, like), ilike(users.name, like), ilike(users.phone, like))
    if (match) filters.push(match)
  }
  if (role && ROLES.includes(role as (typeof ROLES)[number])) filters.push(eq(users.role, role))
  filters.push(state === 'deleted' ? isNotNull(users.deletedAt) : isNull(users.deletedAt))
  return { q, role, state, where: and(...filters) }
}
