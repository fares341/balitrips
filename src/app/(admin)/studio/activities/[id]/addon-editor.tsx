import type { Localized } from '@/db/schema'
import { pick } from '@/lib/content/localize'

import { getAdminI18n } from '../../../_lib/i18n'
import type { Option } from '../../../_lib/lookups'
import {
  Checkbox,
  Field,
  LocalizedField,
  MoneyField,
  PriceLockNote,
  PriceSelect,
  priceInputProps,
  Select,
  TextInput,
} from '../../../_ui/field'
import { AddonPricingOptions, AddonRuleFields } from '../../../_ui/addon-extras'
import { OptionChecklist } from '../../../_ui/select-field'
import { Pill } from '../../../_ui/table'
import { addActivityAddon, removeActivityAddon, saveActivityAddon } from '../actions'

export interface AddonRow {
  id: string
  name: Localized
  description: Localized | null
  priceMinor: number
  currency: string
  pricing: string
  maxQty: number | null
  onlyPackages: string[] | null
  requiresAddonId: string | null
  available: boolean
  sortOrder: number
  /** v2: price steps by quantity and add-ons it cannot be booked with. */
  priceTiers: { minQty: number; priceMinor: number }[] | null
  incompatibleWith: string[] | null
}

/**
 * Add-ons of one activity (handoff "Addon"; design screen 30f).
 *
 * Like the packages, each add-on is its own form so Save and Remove act on
 * exactly the row beside them. The rules the booking box and checkout apply
 * are authored here: pricing (per person / per booking / per quantity with a
 * maximum), "only with these packages", "requires another add-on", and the
 * availability switch. Whether a package *includes* an add-on is set on the
 * package.
 */
export async function AddonEditor({
  activityId,
  addons,
  packages,
  currency,
  locked = false,
}: {
  activityId: string
  addons: readonly AddonRow[]
  /** This activity's packages, for "only with these packages". */
  packages: readonly Option[]
  currency: string
  /** The viewer lacks `prices.write`: prices read-only (a new extra starts free). */
  locked?: boolean
}) {
  const { t, locale } = await getAdminI18n()
  const label = (name: Localized) => pick(name, locale)

  const pricingSelect = (id: string, value: string) => (
    <Field
      label={t('activities.addon_pricing')}
      htmlFor={id}
      hint={t('activities.addon_pricing_hint')}
    >
      <PriceSelect id={id} name="pricing" defaultValue={value} locked={locked}>
        <AddonPricingOptions />
      </PriceSelect>
    </Field>
  )

  const requiresSelect = (id: string, selfId: string | null, value: string | null) => (
    <Field
      label={t('activities.addon_requires')}
      htmlFor={id}
      hint={t('activities.addon_requires_hint')}
    >
      <Select id={id} name="requiresAddonId" defaultValue={value ?? ''}>
        <option value="">{t('activities.addon_requires_none')}</option>
        {addons
          .filter((other) => other.id !== selfId)
          .map((other) => (
            <option key={other.id} value={other.id}>
              {label(other.name)}
            </option>
          ))}
      </Select>
    </Field>
  )

  return (
    <div className="a-card" id="addons">
      <h2>{t('activities.addons_title')}</h2>
      <p className="a-hint">
        {addons.length === 0
          ? t('activities.addons_empty')
          : t('activities.addons_count', { count: addons.length })}
      </p>
      <p className="a-hint">{t('activities.addons_rules')}</p>
      {locked ? <PriceLockNote /> : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          marginBlockStart: 'var(--space-4)',
        }}
      >
        {addons.map((addon) => (
          <form
            key={addon.id}
            className="a-day"
            action={saveActivityAddon.bind(null, activityId, addon.id)}
          >
            <div className="a-day-head">
              <div className="a-day-no">
                {label(addon.name)}
                {addon.available ? null : <Pill tone="bad">{t('activities.addon_off')}</Pill>}
              </div>
              <div className="a-actions">
                <button className="a-btn ghost small" type="submit">
                  {t('activities.addon_save')}
                </button>
                <button
                  className="a-btn danger small"
                  type="submit"
                  formAction={removeActivityAddon.bind(null, activityId, addon.id)}
                >
                  {t('common.remove')}
                </button>
              </div>
            </div>

            <LocalizedField
              name="name"
              label={t('activities.addon_name')}
              value={addon.name}
              required
            />
            <LocalizedField
              name="description"
              label={t('activities.addon_description')}
              value={addon.description}
            />
            <MoneyField minor={addon.priceMinor} currency={addon.currency} locked={locked} />
            <div className="a-row">
              {pricingSelect(`pricing_${addon.id}`, addon.pricing)}
              <Field
                label={t('activities.addon_max_qty')}
                htmlFor={`maxQty_${addon.id}`}
                hint={t('activities.addon_max_qty_hint')}
              >
                <TextInput
                  id={`maxQty_${addon.id}`}
                  name="maxQty"
                  type="number"
                  min={1}
                  dir="ltr"
                  defaultValue={addon.maxQty ?? ''}
                  {...priceInputProps(locked)}
                />
              </Field>
              <Field label={t('activities.sort_order')} htmlFor={`sort_${addon.id}`}>
                <TextInput
                  id={`sort_${addon.id}`}
                  name="sortOrder"
                  inputMode="numeric"
                  dir="ltr"
                  defaultValue={String(addon.sortOrder)}
                />
              </Field>
            </div>
            <OptionChecklist
              name="onlyPackages"
              label={t('activities.addon_only_packages')}
              options={packages}
              values={addon.onlyPackages ?? []}
              hint={t('activities.addon_only_packages_hint')}
            />
            {requiresSelect(`requires_${addon.id}`, addon.id, addon.requiresAddonId)}
            <AddonRuleFields
              idPrefix={`addon_${addon.id}`}
              tiers={addon.priceTiers}
              currency={addon.currency}
              incompatible={addons
                .filter((other) => other.id !== addon.id)
                .map((other) => ({ value: other.id, label: label(other.name) }))}
              values={addon.incompatibleWith}
              locked={locked}
            />
            <Checkbox
              name="available"
              label={t('activities.addon_available')}
              defaultChecked={addon.available}
              hint={t('activities.addon_available_hint')}
            />
          </form>
        ))}

        <form className="a-day" action={addActivityAddon.bind(null, activityId)}>
          <div className="a-day-head">
            <div className="a-day-no">{t('activities.addon_new')}</div>
            <div className="a-actions">
              <button className="a-btn small" type="submit">
                {t('activities.addon_add')}
              </button>
            </div>
          </div>
          <LocalizedField name="name" label={t('activities.addon_name')} required />
          <LocalizedField name="description" label={t('activities.addon_description')} />
          <MoneyField currency={currency} locked={locked} />
          <div className="a-row">
            {pricingSelect('new_addon_pricing', 'per_booking')}
            <Field
              label={t('activities.addon_max_qty')}
              htmlFor="new_addon_max"
              hint={t('activities.addon_max_qty_hint')}
            >
              <TextInput
                id="new_addon_max"
                name="maxQty"
                type="number"
                min={1}
                dir="ltr"
                {...priceInputProps(locked)}
              />
            </Field>
            <Field label={t('activities.sort_order')} htmlFor="new_addon_sort">
              <TextInput
                id="new_addon_sort"
                name="sortOrder"
                inputMode="numeric"
                dir="ltr"
                defaultValue="0"
              />
            </Field>
          </div>
          <OptionChecklist
            name="onlyPackages"
            label={t('activities.addon_only_packages')}
            options={packages}
            values={[]}
            hint={t('activities.addon_only_packages_hint')}
          />
          {requiresSelect('new_addon_requires', null, null)}
          <AddonRuleFields
            idPrefix="new_addon"
            tiers={null}
            currency={currency}
            incompatible={addons.map((other) => ({ value: other.id, label: label(other.name) }))}
            values={[]}
            locked={locked}
          />
          <Checkbox name="available" label={t('activities.addon_available')} defaultChecked />
        </form>
      </div>
    </div>
  )
}
