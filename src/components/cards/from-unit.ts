/**
 * The unit printed after a card's «from» price: «/ person», «/ 2 people»,
 * «/ group of up to 4», «/ booking». It comes from the package that provides
 * the price (lib/content/from-price), never a fixed «per person».
 */

import type { FromPrice } from '@/lib/content/from-price'

type Translate = (key: string, values?: Record<string, string | number>) => string

export function fromUnit(
  t: Translate,
  from: Pick<FromPrice, 'pricing' | 'groupMax'> | null | undefined,
): string {
  switch (from?.pricing) {
    case 'per_couple':
      return t('bt_per_couple')
    case 'per_group':
      return from.groupMax ? t('bt_per_group_max', { n: from.groupMax }) : t('bt_per_group')
    case 'fixed':
      return t('bt_per_booking')
    default:
      return t('bt_per_person')
  }
}
