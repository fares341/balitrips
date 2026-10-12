import type { Localized } from '@/db/schema'

import { Checkbox, Field, LocalizedField, LocalizedListField, MoneyField, Select, StatusField, TextInput } from '../../../_ui/field'
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
export function TierEditor({
  activityId,
  tiers,
  currency,
}: {
  activityId: string
  tiers: readonly TierRow[]
  currency: string
}) {
  return (
    <div className="a-card">
      <h2>Service tiers</h2>
      <p className="a-hint">
        {tiers.length === 0
          ? 'No tiers yet. With none defined the activity sells at its own single price, exactly as before — tiers are optional.'
          : `${tiers.length} tier${tiers.length === 1 ? '' : 's'}. They appear on the activity page cheapest first, whatever order they are listed here.`}
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
          <form key={tier.id} className="a-day" action={saveActivityTier.bind(null, activityId, tier.id)}>
            <div className="a-day-head">
              <div className="a-day-no">
                {tier.key}
                {tier.isPopular ? <Pill tone="info">most popular</Pill> : null}
                {tier.status === 'published' ? null : <Pill tone="bad">draft</Pill>}
              </div>
              <div className="a-actions">
                <button className="a-btn ghost small" type="submit">
                  Save tier
                </button>
                <button
                  className="a-btn danger small"
                  type="submit"
                  formAction={removeActivityTier.bind(null, activityId, tier.id)}
                >
                  Remove
                </button>
              </div>
            </div>

            <LocalizedField name="name" label="Tier name" value={tier.name} required />
            <LocalizedField
              name="tagline"
              label="Tagline"
              value={tier.tagline}
              hint="One line under the title on the card."
            />

            <MoneyField minor={tier.priceMinor} currency={tier.currency} />

            <div className="a-row">
              <Field
                label="Pricing mode"
                htmlFor={`pricingMode_${tier.id}`}
                hint="Per guest multiplies by party size. Flat is one price for the whole booking — use it for a couples rate, or a family of six is charged for one."
              >
                <Select id={`pricingMode_${tier.id}`} name="pricingMode" defaultValue={tier.pricingMode}>
                  <option value="per_guest">Per guest</option>
                  <option value="flat">Flat</option>
                </Select>
              </Field>

              <Field
                label="Max guests"
                htmlFor={`maxGuests_${tier.id}`}
                hint="Blank uses the activity's own cap. A tier may be tighter than the activity, never looser."
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
              label="Most popular"
              defaultChecked={tier.isPopular}
              hint="Draws the ribbon. Ticking this clears it from every other tier of this activity — four ribbons is not a stronger recommendation, it is a page that looks broken."
            />

            <LocalizedListField
              name="features"
              label="Feature chips"
              values={tier.features}
              hint="The short ticked chips on the card. Three or four reads best."
            />
            <LocalizedListField name="highlights" label="Highlights" values={tier.highlights} />
            <LocalizedListField
              name="details"
              label="Additional details"
              values={tier.details}
              hint="Language, difficulty, who it suits."
            />
            <LocalizedListField
              name="notes"
              label="Important notes"
              values={tier.notes}
              hint="What a traveller must know before booking."
            />

            <StatusField value={tier.status} />
          </form>
        ))}

        {/* Add. Separate form so a blank new-tier row can never be submitted
            by pressing Enter inside an existing tier's fields. */}
        <form className="a-day" action={addActivityTier.bind(null, activityId)}>
          <div className="a-day-head">
            <div className="a-day-no">New tier</div>
            <div className="a-actions">
              <button className="a-btn small" type="submit">
                Add tier
              </button>
            </div>
          </div>

          <Field
            label="Key"
            htmlFor="new_tier_key"
            hint="Lowercase identifier, unique within this activity — basic, couples, premium. Not shown to visitors."
          >
            <TextInput id="new_tier_key" name="key" placeholder="premium" required />
          </Field>

          <LocalizedField name="name" label="Tier name" required />
          <LocalizedField name="tagline" label="Tagline" />

          <MoneyField currency={currency} />

          <div className="a-row">
            <Field label="Pricing mode" htmlFor="new_tier_mode">
              <Select id="new_tier_mode" name="pricingMode" defaultValue="per_guest">
                <option value="per_guest">Per guest</option>
                <option value="flat">Flat</option>
              </Select>
            </Field>
            <Field label="Max guests" htmlFor="new_tier_max" hint="Blank uses the activity's cap.">
              <TextInput id="new_tier_max" name="maxGuests" type="number" min={1} />
            </Field>
          </div>

          <Checkbox name="isPopular" label="Most popular" />

          <LocalizedListField name="features" label="Feature chips" />
          <LocalizedListField name="highlights" label="Highlights" />
          <LocalizedListField name="details" label="Additional details" />
          <LocalizedListField name="notes" label="Important notes" />

          <StatusField />
        </form>
      </div>
    </div>
  )
}
