/**
 * The budget of a custom-trip request, as the Studio shows it.
 *
 * Client revision 1: requests carry a category ('economy' | 'mid' | 'luxury').
 * Older requests carry only the per-person amount from the former slider;
 * their category is derived from it (lib/budget-tier.ts) and the amount is
 * kept beside it, so nothing the traveller sent is hidden.
 */

import { isBudgetTier, tierForLegacyBudget, type BudgetTier } from '@/lib/budget-tier'
import { formatMoney } from '@/lib/money'

import type { Translate } from '../../_i18n'

export function budgetLabel(
  t: Translate,
  intl: string,
  request: {
    budgetTier: string | null
    budgetPerPersonMinor: number | null
    currency: string | null
  },
): string {
  const labels: Record<BudgetTier, string> = {
    economy: t('leads.budget_economy'),
    mid: t('leads.budget_mid'),
    luxury: t('leads.budget_luxury'),
  }
  if (isBudgetTier(request.budgetTier)) return labels[request.budgetTier]

  const legacy = tierForLegacyBudget(request.budgetPerPersonMinor, request.currency)
  const amount =
    request.budgetPerPersonMinor !== null && request.currency
      ? t('leads.per_person', {
          amount: formatMoney(request.budgetPerPersonMinor, request.currency, intl),
        })
      : null
  if (legacy !== null && amount !== null) return `${labels[legacy]} (${amount})`
  return amount ?? '—'
}
