/**
 * Budget-category filter — "All · Economy · Mid-range · Luxury" as links
 * (`?budget=economy`), so a filtered listing is a plain, shareable,
 * server-rendered URL. Used by /packages and /itineraries.
 *
 * Counts are of the real items in each category (see lib/budget-tier.ts for
 * how a price maps onto a category). A category with nothing in it is still
 * shown, with 0, so the three choices never move around.
 */

import { useTranslations } from 'next-intl'

import { BUDGET_TIER_LABEL, BUDGET_TIERS, type BudgetTier } from '@/lib/budget-tier'

import { ChipLink, ChipRow } from './chip'

export type TierFilterProps = {
  /** Path of the listing, locale-agnostic (e.g. '/packages'). */
  basePath: string
  active: BudgetTier | null
  counts: Record<BudgetTier, number>
  total: number
}

export function TierFilter({ basePath, active, counts, total }: TierFilterProps) {
  const t = useTranslations()

  return (
    <ChipRow scroll label={t('ct_budget')} className="tier-filter">
      <ChipLink href={basePath} active={active === null} count={total}>
        {t('bud_all')}
      </ChipLink>
      {BUDGET_TIERS.map((tier) => (
        <ChipLink
          key={tier}
          href={`${basePath}?budget=${tier}`}
          active={active === tier}
          count={counts[tier]}
        >
          {t(BUDGET_TIER_LABEL[tier])}
        </ChipLink>
      ))}
    </ChipRow>
  )
}
