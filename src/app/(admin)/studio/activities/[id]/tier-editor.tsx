import type { Localized } from '@/db/schema'

import {
  Checkbox,
  Field,
  LocalizedField,
  LocalizedListField,
  MoneyField,
  Select,
  StatusField,
  TextInput,
} from '../../../_ui/field'
import { getAdminI18n } from '../../../_lib/i18n'
import { Pill } from '../../../_ui/table'
import { addActivityTier, removeActivityTier, saveActivityTier } from '../actions'

export interface TierRow {
  id: string
  key: string
  name: Localized
  tagline: Localized | null
  priceMinor: number
  currency: string
  pricingMode: string
  maxGuests: number | null
  isPopular: boolean
  features: Localized[] | null
  highlights: Localized[] | null
  details: Localized[] | null
  notes: Localized[] | null
  status: string
}

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
}: {
  activityId: string
  tiers: readonly TierRow[]
  currency: string
}) {
  const { t } = await getAdminI18n()
  return (
    <div className="a-card">
      <h2>{t('activities.tiers_title')}</h2>
      <p className="a-hint">
        {tiers.length === 0
          ? t('activities.tiers_empty')
          : t('activities.tiers_count', { count: tiers.length })}
      </p>

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
                <button
                  className="a-btn danger small"
                  type="submit"
                  formAction={removeActivityTier.bind(null, activityId, tier.id)}
                >
                  {t('common.remove')}
                </button>
              </div>
            </div>

            <LocalizedField
              name="name"
              label={t('activities.tier_name')}
              value={tier.name}
              required
            />
            <LocalizedField
              name="tagline"
              label={t('activities.tier_tagline')}
              value={tier.tagline}
              hint={t('activities.tier_tagline_hint')}
            />

            <MoneyField minor={tier.priceMinor} currency={tier.currency} />

            <div className="a-row">
              <Field
                label={t('activities.pricing_mode')}
                htmlFor={`pricingMode_${tier.id}`}
                hint={t('activities.pricing_mode_hint')}
              >
                <Select
                  id={`pricingMode_${tier.id}`}
                  name="pricingMode"
                  defaultValue={tier.pricingMode}
                >
                  <option value="per_guest">{t('activities.per_guest')}</option>
                  <option value="flat">{t('activities.flat')}</option>
                </Select>
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
              name="isPopular"
              label={t('activities.tier_popular')}
              defaultChecked={tier.isPopular}
              hint={t('activities.tier_popular_hint')}
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

          <LocalizedField name="name" label={t('activities.tier_name')} required />
          <LocalizedField name="tagline" label={t('activities.tier_tagline')} />

          <MoneyField currency={currency} />

          <div className="a-row">
            <Field label={t('activities.pricing_mode')} htmlFor="new_tier_mode">
              <Select id="new_tier_mode" name="pricingMode" defaultValue="per_guest">
                <option value="per_guest">{t('activities.per_guest')}</option>
                <option value="flat">{t('activities.flat')}</option>
              </Select>
            </Field>
            <Field
              label={t('activities.max_guests')}
              htmlFor="new_tier_max"
              hint={t('activities.tier_max_guests_new_hint')}
            >
              <TextInput id="new_tier_max" name="maxGuests" type="number" min={1} />
            </Field>
          </div>

          <Checkbox name="isPopular" label={t('activities.tier_popular')} />

          <LocalizedListField name="features" label={t('activities.tier_features')} />
          <LocalizedListField name="highlights" label={t('activities.tier_highlights')} />
          <LocalizedListField name="details" label={t('activities.tier_details')} />
          <LocalizedListField name="notes" label={t('activities.tier_notes')} />

          <StatusField />
        </form>
      </div>
    </div>
  )
}
