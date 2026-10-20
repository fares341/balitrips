import { getAdminI18n } from '../../../_lib/i18n'
import type { Option } from '../../../_lib/lookups'
import { Field, Select } from '../../../_ui/field'
import { SortableList } from '../../../_ui/sortable'
import {
  addTierIncluded,
  removeTierIncluded,
  reorderTierIncluded,
  saveTierIncluded,
} from '../actions'

export interface IncludedTier {
  id: string
  name: string
  included: { id: string; activityId: string; name: string; timing: 'same_slot' | 'own_slot' }[]
}

/**
 * Activities each package includes at no extra charge (same day): add one,
 * choose whether it runs at the package's time or the customer picks one of
 * its own times, reorder, remove. Each row is its own small form.
 */
export async function IncludedEditor({
  activityId,
  tiers,
  choices,
}: {
  activityId: string
  tiers: readonly IncludedTier[]
  /** Activities that can be included (every other activity). */
  choices: readonly Option[]
}) {
  const { t } = await getAdminI18n()

  const timingSelect = (id: string, value: string) => (
    <Field label={t('ae.inc_timing')} htmlFor={id}>
      <Select id={id} name="timing" defaultValue={value}>
        <option value="same_slot">{t('ae.inc_same')}</option>
        <option value="own_slot">{t('ae.inc_own')}</option>
      </Select>
    </Field>
  )

  return (
    <div className="a-card">
      <h2>{t('ae.inc_title')}</h2>
      <p className="a-hint">{t('ae.inc_hint')}</p>
      {tiers.length === 0 ? <p className="a-hint">{t('ae.inc_none_tiers')}</p> : null}
      <div className="a-stack">
        {tiers.map((tier) => {
          const taken = new Set(tier.included.map((row) => row.activityId))
          const free = choices.filter((choice) => !taken.has(choice.value))
          return (
            <section key={tier.id} className="a-day" aria-label={tier.name}>
              <div className="a-day-head">
                <div className="a-day-no">{tier.name}</div>
              </div>
              {tier.included.length === 0 ? (
                <p className="a-hint">{t('ae.inc_empty')}</p>
              ) : (
                <SortableList
                  hint={tier.included.length > 1 ? t('ae.order_hint') : undefined}
                  onSave={reorderTierIncluded.bind(null, activityId, tier.id)}
                  rows={tier.included.map((row) => ({
                    id: row.id,
                    label: row.name,
                    content: (
                      <form
                        className="a-inc-row"
                        action={saveTierIncluded.bind(null, activityId, tier.id, row.id)}
                      >
                        <b>{row.name}</b>
                        {timingSelect(`timing_${row.id}`, row.timing)}
                        <span className="a-actions">
                          <button className="a-btn ghost small" type="submit">
                            {t('ae.inc_save')}
                          </button>
                          <button
                            className="a-btn danger small"
                            type="submit"
                            formAction={removeTierIncluded.bind(null, activityId, tier.id, row.id)}
                          >
                            {t('ae.inc_remove')}
                          </button>
                        </span>
                      </form>
                    ),
                  }))}
                />
              )}
              {free.length > 0 ? (
                <form
                  className="a-inc-row a-inc-new"
                  action={addTierIncluded.bind(null, activityId, tier.id)}
                >
                  <Field label={t('ae.inc_activity')} htmlFor={`inc_new_${tier.id}`}>
                    <Select
                      id={`inc_new_${tier.id}`}
                      name="includedActivityId"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        {t('ae.inc_choose')}
                      </option>
                      {free.map((choice) => (
                        <option key={choice.value} value={choice.value}>
                          {choice.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {timingSelect(`inc_timing_${tier.id}`, 'same_slot')}
                  <span className="a-actions">
                    <button className="a-btn small" type="submit">
                      {t('ae.inc_add')}
                    </button>
                  </span>
                </form>
              ) : null}
            </section>
          )
        })}
      </div>
    </div>
  )
}
