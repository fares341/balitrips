import { asc, inArray } from 'drizzle-orm'

import { db } from '@/db'
import { tierSeasonalPrices, type activities } from '@/db/schema'
import { weekdayList } from '@/lib/availability/rules'
import { formatMoney } from '@/lib/money'

import { getAdminI18n } from '../../../_lib/i18n'
import { Field, PriceLockNote, TextInput } from '../../../_ui/field'
import { Empty } from '../../../_ui/table'
import { addSeasonalPrice, removeSeasonalPrice, saveChildAges } from '../availability-actions'

type ActivityRow = typeof activities.$inferSelect

function weekdayNames(intl: string): string[] {
  const format = new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: 'UTC' })
  return Array.from({ length: 7 }, (_, index) =>
    format.format(new Date(Date.UTC(2024, 0, 7 + index))),
  )
}

/** Ages that count as a child (and below which a child is a free infant). */
export async function ChildAgesCard({ activity }: { activity: ActivityRow }) {
  const { t } = await getAdminI18n()
  return (
    <form className="a-card" action={saveChildAges.bind(null, activity.id)}>
      <h2>{t('av.children_title')}</h2>
      <p className="a-hint">{t('av.children_hint')}</p>
      <div className="a-row">
        <Field label={t('av.child_min')} htmlFor="childAgeMin" hint={t('av.child_min_hint')}>
          <TextInput
            id="childAgeMin"
            name="childAgeMin"
            type="number"
            min={0}
            max={17}
            dir="ltr"
            defaultValue={activity.childAgeMin ?? ''}
          />
        </Field>
        <Field label={t('av.child_max')} htmlFor="childAgeMax">
          <TextInput
            id="childAgeMax"
            name="childAgeMax"
            type="number"
            min={0}
            max={17}
            dir="ltr"
            defaultValue={activity.childAgeMax ?? ''}
          />
        </Field>
        <div className="a-actions">
          <button className="a-btn ghost" type="submit">
            {t('av.save_child_ages')}
          </button>
        </div>
      </div>
    </form>
  )
}

/** Seasonal prices of every package of the activity. */
export async function SeasonEditor({
  activityId,
  tiers,
  locked = false,
}: {
  activityId: string
  /** The viewer lacks `prices.write`: seasons are listed, not added or removed. */
  locked?: boolean
  tiers: readonly {
    id: string
    name: string
    currency: string
    priceMinor: number
    childPriceMinor: number | null
  }[]
}) {
  const { t, intl } = await getAdminI18n()
  if (tiers.length === 0) return null
  const seasons = await db
    .select()
    .from(tierSeasonalPrices)
    .where(
      inArray(
        tierSeasonalPrices.tierId,
        tiers.map((tier) => tier.id),
      ),
    )
    .orderBy(asc(tierSeasonalPrices.fromDate))
  const days = weekdayNames(intl)

  return (
    <div className="a-card">
      <h2>{t('av.seasons_title')}</h2>
      <p className="a-hint">{t('av.seasons_hint')}</p>
      {locked ? <PriceLockNote /> : null}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          marginBlockStart: 'var(--space-4)',
        }}
      >
        {tiers.map((tier) => {
          const own = seasons.filter((season) => season.tierId === tier.id)
          return (
            <div className="a-day" key={tier.id} id={`seasons-${tier.id}`}>
              <div className="a-day-head">
                <div className="a-day-no">{tier.name}</div>
                <span className="a-muted">
                  {t('av.base_price', { price: formatMoney(tier.priceMinor, tier.currency, intl) })}
                </span>
              </div>
              {own.length === 0 ? (
                <Empty>{t('av.seasons_empty')}</Empty>
              ) : (
                <ul style={{ display: 'grid', gap: 6, paddingInlineStart: 18 }}>
                  {own.map((season) => {
                    const weekdays = weekdayList(season.weekdays)
                    return (
                      <li key={season.id}>
                        <form
                          className="a-inline-form"
                          action={removeSeasonalPrice.bind(null, activityId, season.id)}
                          style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                          }}
                        >
                          <b>{season.label ?? t('av.season')}</b>
                          <span className="a-mono">
                            {season.fromDate} – {season.toDate}
                          </span>
                          <span dir="ltr">
                            {formatMoney(season.priceMinor, tier.currency, intl)}
                          </span>
                          {season.childPriceMinor !== null ? (
                            <span className="a-muted">
                              {t('av.season_child', {
                                price: formatMoney(season.childPriceMinor, tier.currency, intl),
                              })}
                            </span>
                          ) : null}
                          {weekdays.length > 0 ? (
                            <span className="a-muted">
                              {weekdays.map((index) => days[index]).join(' ')}
                            </span>
                          ) : null}
                          {locked ? null : (
                            <button className="a-btn danger small" type="submit">
                              {t('common.remove')}
                            </button>
                          )}
                        </form>
                      </li>
                    )
                  })}
                </ul>
              )}
              {locked ? null : (
                <form action={addSeasonalPrice.bind(null, activityId, tier.id)}>
                  <input type="hidden" name="currency" value={tier.currency} />
                  <div className="a-row">
                    <Field
                      label={t('av.season_label')}
                      htmlFor={`sl-${tier.id}`}
                      hint={t('av.season_label_hint')}
                    >
                      <TextInput id={`sl-${tier.id}`} name="label" maxLength={80} />
                    </Field>
                    <Field label={t('av.from')} htmlFor={`sf-${tier.id}`}>
                      <TextInput
                        id={`sf-${tier.id}`}
                        name="fromDate"
                        type="date"
                        dir="ltr"
                        required
                      />
                    </Field>
                    <Field label={t('av.to')} htmlFor={`st-${tier.id}`}>
                      <TextInput
                        id={`st-${tier.id}`}
                        name="toDate"
                        type="date"
                        dir="ltr"
                        required
                      />
                    </Field>
                    <Field
                      label={`${t('common.price')} (${tier.currency})`}
                      htmlFor={`sp-${tier.id}`}
                    >
                      <TextInput
                        id={`sp-${tier.id}`}
                        name="price"
                        inputMode="decimal"
                        dir="ltr"
                        required
                      />
                    </Field>
                    {tier.childPriceMinor !== null ? (
                      <Field
                        label={t('av.child_price')}
                        htmlFor={`sc-${tier.id}`}
                        hint={t('av.season_child_hint')}
                      >
                        <TextInput
                          id={`sc-${tier.id}`}
                          name="childPrice"
                          inputMode="decimal"
                          dir="ltr"
                        />
                      </Field>
                    ) : null}
                  </div>
                  <fieldset className="a-field" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend>{t('av.season_weekdays')}</legend>
                    <div className="a-row" style={{ gap: 12 }}>
                      {days.map((name, index) => (
                        <label key={name} className="a-check">
                          <input type="checkbox" name="weekdays" value={String(index)} />
                          {name}
                        </label>
                      ))}
                    </div>
                    <span className="a-hint">{t('av.season_weekdays_hint')}</span>
                  </fieldset>
                  <div className="a-actions">
                    <button className="a-btn ghost small" type="submit">
                      {t('av.season_add')}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
