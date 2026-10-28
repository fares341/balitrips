import type { Localized } from '@/db/schema'
import { formatMoneyInput } from '@/lib/money-input'

import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  PriceLockNote,
  PriceSelect,
  priceInputProps,
  Select,
  StatusField,
  TextInput,
} from '../../../_ui/field'
import { getAdminI18n } from '../../../_lib/i18n'
import type { Option } from '../../../_lib/lookups'
import { OptionChecklist } from '../../../_ui/select-field'
import { Pill } from '../../../_ui/table'
import { addActivityTier, removeActivityTier, saveActivityTier } from '../actions'
import { duplicateActivityTier } from '../v2-actions'
import type { PickerItem } from '../../../_ui/media-picker'

export interface TierRow {
  id: string
  key: string
  name: Localized
  tagline: Localized | null
  priceMinor: number
  currency: string
  pricingMode: string
  groupMax: number | null
  maxGuests: number | null
  minGuests: number | null
  includes: Localized[] | null
  excludes: Localized[] | null
  includesAddons: string[] | null
  available: boolean
  isPopular: boolean
  features: Localized[] | null
  highlights: Localized[] | null
  details: Localized[] | null
  notes: Localized[] | null
  status: string
  /** Phase 2: price per child (per-person packages). Null = adult price. */
  childPriceMinor: number | null
  /** v2: reference price, ribbon, picture, duration, longer text. */
  compareAtPriceMinor: number | null
  badgeLabel: Localized | null
  badgeColor: string | null
  imageId: string | null
  duration: Localized | null
  description: Localized | null
}

const BADGE_COLORS = ['sun', 'palm', 'forest', 'coral', 'sky', 'ink'] as const

/**
 * Service tiers for one activity.
 *
 * Edited here rather than in a section of their own, because a tier has no
 * meaning away from its activity: a "Premium" row in a global list says
 * nothing about which tour it belongs to, and the first question anyone asks
 * of a price is "of what?".
 *
 * Each tier is its own form — HTML forbids nesting them — so Save and Remove
 * act on exactly the row whose fields they sit beside, and editing one tier
 * can never post another's values.
 */
export async function TierEditor({
  activityId,
  tiers,
  currency,
  addons,
  media = [],
  locked = false,
}: {
  activityId: string
  tiers: readonly TierRow[]
  currency: string
  /** This activity's add-ons, for "included in this package". */
  addons: readonly Option[]
  /** Media library, for the package picture. */
  media?: readonly PickerItem[]
  /** The viewer lacks `prices.write`: prices read-only, no new or removed packages. */
  locked?: boolean
}) {
  const { t } = await getAdminI18n()
  // Rows saved before migration 0013 may still say per_guest / flat.
  const mode = (value: string) =>
    value === 'per_couple'
      ? 'per_couple'
      : value === 'per_group' || value === 'flat'
        ? 'per_group'
        : value === 'fixed'
          ? 'fixed'
          : 'per_person'
  return (
    <div className="a-card">
      <h2>{t('activities.tiers_title')}</h2>
      <p className="a-hint">
        {tiers.length === 0
          ? t('activities.tiers_empty')
          : t('activities.tiers_count', { count: tiers.length })}
      </p>
      {locked ? <PriceLockNote /> : null}

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          marginBlockStart: 'var(--space-4)',
        }}
      >
        {tiers.map((tier) => (
          <form
            key={tier.id}
            className="a-day"
            data-tier={tier.status}
            action={saveActivityTier.bind(null, activityId, tier.id)}
          >
            <div className="a-day-head">
              <div className="a-day-no">
                {tier.key}
                {tier.isPopular ? (
                  <Pill tone="info">{t('activities.tier_popular_pill')}</Pill>
                ) : null}
                {tier.status === 'published' ? null : <Pill tone="bad">{t('common.draft')}</Pill>}
              </div>
              <div className="a-actions">
                <button className="a-btn ghost small" type="submit">
                  {t('activities.tier_save')}
                </button>
                {locked ? null : (
                  <button
                    className="a-btn ghost small"
                    type="submit"
                    formAction={duplicateActivityTier.bind(null, activityId, tier.id)}
                    formNoValidate
                  >
                    {t('av2.duplicate_pkg')}
                  </button>
                )}
                {locked ? null : (
                  <button
                    className="a-btn danger small"
                    type="submit"
                    formAction={removeActivityTier.bind(null, activityId, tier.id)}
                  >
                    {t('common.remove')}
                  </button>
                )}
              </div>
            </div>

            <LocalizedField
              name="name"
              label={t('activities.tier_name')}
              value={tier.name}
              required
              anyLanguage
            />
            <LocalizedField
              name="tagline"
              label={t('activities.tier_tagline')}
              value={tier.tagline}
              hint={t('activities.tier_tagline_hint')}
            />
            <LocalizedField
              name="description"
              label={t('av2.pkg_description')}
              value={tier.description}
              rows={2}
              hint={t('av2.pkg_description_hint')}
            />

            <MoneyField minor={tier.priceMinor} currency={tier.currency} locked={locked} />
            <Field
              label={t('av2.compare_at')}
              htmlFor={`compareAt_${tier.id}`}
              hint={t('av2.compare_at_hint')}
            >
              <TextInput
                id={`compareAt_${tier.id}`}
                name="compareAtPrice"
                inputMode="decimal"
                dir="ltr"
                defaultValue={
                  tier.compareAtPriceMinor === null
                    ? ''
                    : formatMoneyInput(tier.compareAtPriceMinor, tier.currency)
                }
                {...priceInputProps(locked)}
              />
            </Field>
            <div className="a-row">
              <Field
                label={t('av2.pkg_image')}
                htmlFor={`imageId_${tier.id}`}
                hint={t('av2.pkg_image_hint')}
              >
                <Select id={`imageId_${tier.id}`} name="imageId" defaultValue={tier.imageId ?? ''}>
                  <option value="">{t('av2.pkg_image_none')}</option>
                  {tier.imageId !== null && !media.some((item) => item.id === tier.imageId) ? (
                    <option value={tier.imageId}>{t('av2.pkg_image_keep')}</option>
                  ) : null}
                  {media.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.objectKey.split('/').pop()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t('av2.badge_color')} htmlFor={`badgeColor_${tier.id}`}>
                <Select
                  id={`badgeColor_${tier.id}`}
                  name="badgeColor"
                  defaultValue={tier.badgeColor ?? ''}
                >
                  <option value="">{t('av2.badge_color_default')}</option>
                  {BADGE_COLORS.map((color) => (
                    <option key={color} value={color}>
                      {t(`av2.color_${color}`)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <LocalizedField
              name="badgeLabel"
              label={t('av2.badge_label')}
              value={tier.badgeLabel}
              hint={t('av2.badge_label_hint')}
            />
            <LocalizedField
              name="duration"
              label={t('av2.pkg_duration')}
              value={tier.duration}
              hint={t('av2.pkg_duration_hint')}
            />
            <Field
              label={t('av.child_price')}
              htmlFor={`childPrice_${tier.id}`}
              hint={t('av.child_price_hint')}
            >
              <TextInput
                id={`childPrice_${tier.id}`}
                name="childPrice"
                inputMode="decimal"
                dir="ltr"
                defaultValue={
                  tier.childPriceMinor === null
                    ? ''
                    : formatMoneyInput(tier.childPriceMinor, tier.currency)
                }
                {...priceInputProps(locked)}
              />
            </Field>

            <div className="a-row">
              <Field
                label={t('activities.pricing_mode')}
                htmlFor={`pricingMode_${tier.id}`}
                hint={t('activities.pricing_mode_hint')}
              >
                <PriceSelect
                  id={`pricingMode_${tier.id}`}
                  name="pricingMode"
                  defaultValue={mode(tier.pricingMode)}
                  locked={locked}
                >
                  <option value="per_person">{t('activities.per_person')}</option>
                  <option value="per_group">{t('activities.per_group')}</option>
                  <option value="per_couple">{t('ae.per_couple')}</option>
                  <option value="fixed">{t('av2.per_fixed')}</option>
                </PriceSelect>
              </Field>

              <Field
                label={t('ae.tier_min_guests')}
                htmlFor={`minGuests_${tier.id}`}
                hint={t('ae.tier_min_guests_hint')}
              >
                <TextInput
                  id={`minGuests_${tier.id}`}
                  name="minGuests"
                  type="number"
                  min={1}
                  dir="ltr"
                  defaultValue={tier.minGuests ?? ''}
                />
              </Field>

              <Field
                label={t('activities.group_max')}
                htmlFor={`groupMax_${tier.id}`}
                hint={t('activities.group_max_hint')}
              >
                <TextInput
                  id={`groupMax_${tier.id}`}
                  name="groupMax"
                  type="number"
                  min={1}
                  dir="ltr"
                  defaultValue={tier.groupMax ?? ''}
                  {...priceInputProps(locked)}
                />
              </Field>

              <Field
                label={t('activities.max_guests')}
                htmlFor={`maxGuests_${tier.id}`}
                hint={t('activities.tier_max_guests_hint')}
              >
                <TextInput
                  id={`maxGuests_${tier.id}`}
                  name="maxGuests"
                  type="number"
                  min={1}
                  defaultValue={tier.maxGuests ?? ''}
                />
              </Field>
            </div>

            <Checkbox
              name="available"
              label={t('activities.pkg_available')}
              defaultChecked={tier.available}
              hint={t('activities.pkg_available_hint')}
            />
            <Checkbox
              name="isPopular"
              label={t('activities.tier_popular')}
              defaultChecked={tier.isPopular}
              hint={t('activities.tier_popular_hint')}
            />

            <LocalizedListField
              name="includes"
              label={t('activities.pkg_includes')}
              values={tier.includes}
              hint={t('activities.pkg_includes_hint')}
            />
            <LocalizedListField
              name="excludes"
              label={t('activities.pkg_excludes')}
              values={tier.excludes}
            />
            <OptionChecklist
              name="includesAddons"
              label={t('activities.pkg_includes_addons')}
              options={addons}
              values={tier.includesAddons ?? []}
              hint={t('activities.pkg_includes_addons_hint')}
            />

            <LocalizedListField
              name="features"
              label={t('activities.tier_features')}
              values={tier.features}
              hint={t('activities.tier_features_hint')}
            />
            <LocalizedListField
              name="highlights"
              label={t('activities.tier_highlights')}
              values={tier.highlights}
            />
            <LocalizedListField
              name="details"
              label={t('activities.tier_details')}
              values={tier.details}
              hint={t('activities.tier_details_hint')}
            />
            <LocalizedListField
              name="notes"
              label={t('activities.tier_notes')}
              values={tier.notes}
              hint={t('activities.tier_notes_hint')}
            />

            <StatusField value={tier.status} />
          </form>
        ))}

        {/* Add. Separate form so a blank new-tier row can never be submitted
            by pressing Enter inside an existing tier's fields. */}
        {locked ? null : (
          <form className="a-day" action={addActivityTier.bind(null, activityId)}>
            <div className="a-day-head">
              <div className="a-day-no">{t('activities.tier_new')}</div>
              <div className="a-actions">
                <button className="a-btn small" type="submit">
                  {t('activities.tier_add')}
                </button>
              </div>
            </div>

            <Field
              label={t('activities.tier_key')}
              htmlFor="new_tier_key"
              hint={t('activities.tier_key_hint')}
            >
              <TextInput id="new_tier_key" name="key" placeholder="premium" required />
            </Field>

            <LocalizedField name="name" label={t('activities.tier_name')} required anyLanguage />
            <LocalizedField name="tagline" label={t('activities.tier_tagline')} />

            <MoneyField currency={currency} />

            <div className="a-row">
              <Field label={t('activities.pricing_mode')} htmlFor="new_tier_mode">
                <Select id="new_tier_mode" name="pricingMode" defaultValue="per_person">
                  <option value="per_person">{t('activities.per_person')}</option>
                  <option value="per_group">{t('activities.per_group')}</option>
                  <option value="per_couple">{t('ae.per_couple')}</option>
                  <option value="fixed">{t('av2.per_fixed')}</option>
                </Select>
              </Field>
              <Field
                label={t('ae.tier_min_guests')}
                htmlFor="new_tier_min"
                hint={t('ae.tier_min_guests_hint')}
              >
                <TextInput id="new_tier_min" name="minGuests" type="number" min={1} dir="ltr" />
              </Field>
              <Field
                label={t('activities.group_max')}
                htmlFor="new_tier_group"
                hint={t('activities.group_max_hint')}
              >
                <TextInput id="new_tier_group" name="groupMax" type="number" min={1} dir="ltr" />
              </Field>
              <Field
                label={t('activities.max_guests')}
                htmlFor="new_tier_max"
                hint={t('activities.tier_max_guests_new_hint')}
              >
                <TextInput id="new_tier_max" name="maxGuests" type="number" min={1} />
              </Field>
            </div>

            <Checkbox name="available" label={t('activities.pkg_available')} defaultChecked />
            <Checkbox name="isPopular" label={t('activities.tier_popular')} />
            <LocalizedListField name="includes" label={t('activities.pkg_includes')} />
            <LocalizedListField name="excludes" label={t('activities.pkg_excludes')} />
            <OptionChecklist
              name="includesAddons"
              label={t('activities.pkg_includes_addons')}
              options={addons}
              values={[]}
            />

            <LocalizedListField name="features" label={t('activities.tier_features')} />
            <LocalizedListField name="highlights" label={t('activities.tier_highlights')} />
            <LocalizedListField name="details" label={t('activities.tier_details')} />
            <LocalizedListField name="notes" label={t('activities.tier_notes')} />

            <StatusField />
          </form>
        )}
      </div>
    </div>
  )
}
