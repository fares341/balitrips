import { formatMoneyInput } from '@/lib/money-input'

import { getAdminI18n } from '../_lib/i18n'
import type { Option } from '../_lib/lookups'
import { Field, priceInputProps, TextArea } from './field'
import { OptionChecklist } from './select-field'

/** The add-on pricing choices (v2 adds per hour and by quantity). */
export async function AddonPricingOptions() {
  const { t } = await getAdminI18n()
  return (
    <>
      <option value="per_person">{t('activities.addon_per_person')}</option>
      <option value="per_booking">{t('activities.addon_per_booking')}</option>
      <option value="per_qty">{t('activities.addon_per_qty')}</option>
      <option value="per_hour">{t('av2.addon_per_hour')}</option>
      <option value="tiered">{t('av2.addon_tiered')}</option>
    </>
  )
}

/**
 * v2 add-on rules: price steps by quantity (used with «by quantity» pricing)
 * and the add-ons this one cannot be booked with.
 */
export async function AddonRuleFields({
  idPrefix,
  tiers,
  currency,
  incompatible,
  values,
  locked,
}: {
  idPrefix: string
  tiers: readonly { minQty: number; priceMinor: number }[] | null | undefined
  currency: string
  /** Other add-ons it may clash with. Empty = no checklist. */
  incompatible: readonly Option[]
  values: readonly string[] | null | undefined
  locked: boolean
}) {
  const { t } = await getAdminI18n()
  return (
    <>
      <Field label={t('av2.tiers')} htmlFor={`${idPrefix}-tiers`} hint={t('av2.tiers_hint')}>
        <TextArea
          id={`${idPrefix}-tiers`}
          name="priceTiers"
          rows={3}
          dir="ltr"
          placeholder={'3 = 25.00\n6 = 20.00'}
          defaultValue={(tiers ?? [])
            .map((tier) => `${tier.minQty} = ${formatMoneyInput(tier.priceMinor, currency)}`)
            .join('\n')}
          {...priceInputProps(locked)}
        />
      </Field>
      {incompatible.length > 0 ? (
        <OptionChecklist
          name="incompatibleWith"
          label={t('av2.incompatible')}
          options={incompatible}
          values={values ?? []}
          hint={t('av2.incompatible_hint')}
        />
      ) : null}
    </>
  )
}
