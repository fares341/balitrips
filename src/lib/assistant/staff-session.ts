/**
 * Who is calling the Studio assistant endpoints. Same rules as every Studio
 * page (`requireCapability('admin.access')`): an elevated role with
 * `admin.access`, and — when two-factor is required — a verified session.
 * Answers with a status instead of rendering a 404 page, since these are
 * JSON endpoints.
 */

import { getAdminSession, twoFactorGate, type AdminSession } from '@/app/(admin)/_lib/session'
import { can, isElevated } from '@/lib/auth/roles'

export type StaffGate =
  | { ok: true; session: AdminSession }
  | { ok: false; status: 401 | 403 | 404; code: string }

export async function staffGate(): Promise<StaffGate> {
  const session = await getAdminSession()
  if (session === null) return { ok: false, status: 401, code: 'signed_out' }
  if (!isElevated(session.role) || !can(session.role, 'admin.access')) {
    return { ok: false, status: 404, code: 'not_found' }
  }
  if ((await twoFactorGate(session)) !== 'satisfied') {
    return { ok: false, status: 403, code: 'two_factor_required' }
  }
  return { ok: true, session }
}
