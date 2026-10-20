import { can, type Role } from '@/lib/auth/roles'

import { getAdminI18n } from '../../_lib/i18n'
import type { BuildContext } from '@/lib/reports/builders/helpers'

/**
 * Who sees what in reports.
 *
 * `finance` — costs, margins, payables and the financial report: admin, or
 * whoever holds the money capability.
 */
export function reportAccess(role: Role) {
  return {
    finance: can(role, 'finance.read'),
    customers: can(role, 'customers.read'),
    orders: can(role, 'orders.read'),
  }
}

export async function buildContext(
  role: Role,
): Promise<BuildContext & { locale: 'ar' | 'en'; rtl: boolean }> {
  const { t, intl, locale } = await getAdminI18n()
  const access = reportAccess(role)
  return {
    t,
    intl,
    locale,
    rtl: locale === 'ar',
    finance: access.finance,
    customers: access.customers,
    now: new Date(),
  }
}
