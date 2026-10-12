'use client'

/**
 * The service levels of one activity, as a row of cards.
 *
 * Built to the client's design: a card per tier with its price, a short
 * tagline and ticked feature chips; the most popular one ringed and badged;
 * and an expandable panel beneath carrying the practical detail — departure,
 * location, party size, duration, then highlights, details and notes.
 *
 * The panel is a sibling of the grid rather than a child of a card. Expanding
 * inside a card would stretch one column and leave the others short, and on a
 * phone it would bury the detail under the cards below it.
 *
 * Choosing a tier does NOT add to the cart on its own. A booking still needs a
 * date, a time and a party size, and those live in the booking box; the choice
 * travels there through TierSelectionContext. A button that added straight to
 * the cart would either invent a date or fail, and both are worse than sending
 * the visitor three inches to the right.
 */

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'

import { Button } from '@/components/shared'
import { Icon, Photo } from '@/components/ui'
import type { IconName } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { pick, pickOptional } from '@/lib/content/localize'
import type { ActivityTierDto, MediaDto } from '@/lib/content/types'
import { formatMoney } from '@/lib/money'

import { useTierSelection } from './tier-selection'

export type ActivityTiersProps = {
  tiers: readonly ActivityTierDto[]
  /** Read from the activity, never repeated per tier. */
  area: string | null
  duration: string | null
  timeSlots: readonly string[]
  maxGuests: number
  hero: MediaDto | null
}

export function ActivityTiers({
  tiers,
  area,
  duration,
  timeSlots,
  maxGuests,
  hero,
}: ActivityTiersProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const format = useFormatter()
  const { selected, select } = useTierSelection()
  const [openId, setOpenId] = useState<string | null>(null)

  if (tiers.length === 0) return null

  const open = tiers.find((tier) => tier.id === openId) ?? null

  return (
    <section className="bt-tiers-sec" aria-labelledby="bt-tiers-h">
      <h2 className="bt-detail-h" id="bt-tiers-h">
        {t('tier_choose')}
      </h2>
      <p className="muted" style={{ marginTop: -4 }}>
        {t('tier_choose_sub')}
      </p>

      <div className="bt-tiers">
        {tiers.map((tier) => {
          const isChosen = selected?.id === tier.id
          const cap = tier.maxGuests ?? maxGuests
          return (
            <article
              key={tier.id}
              className={['bt-tier', tier.isPopular ? 'popular' : '', isChosen ? 'chosen' : '']
                .filter(Boolean)
                .join(' ')}
            >
              {tier.isPopular && <span className="bt-tier-badge">{t('tier_popular')}</span>}

              <h3 className="bt-tier-name">{pick(tier.name, locale, tier.key)}</h3>

              <p className="bt-tier-price">
                {formatMoney(tier.priceMinor, tier.currency, locale)}
                <span className="bt-tier-unit">
                  {tier.pricingMode === 'per_guest' ? t('c_pp') : t('tier_flat')}
                </span>
              </p>

              {pickOptional(tier.tagline, locale) !== null && (
                <p className="bt-tier-tag">{pickOptional(tier.tagline, locale)}</p>
              )}

              {tier.features.length > 0 && (
                <ul className="bt-tier-feats">
                  {tier.features.map((feature, i) => {
                    const text = pick(feature, locale, '')
                    return (
                      <li key={`${tier.id}-f${i}`}>
                        <Icon name="check" size={12} color="var(--forest)" />
                        {text}
                      </li>
                    )
                  })}
                </ul>
              )}

              <Button
                variant={tier.isPopular || isChosen ? 'forest' : 'ghost'}
                block
                aria-pressed={isChosen}
                onClick={() =>
                  select(
                    isChosen
                      ? null
                      : {
                          id: tier.id,
                          priceMinor: tier.priceMinor,
                          currency: tier.currency,
                          pricingMode: tier.pricingMode,
                          maxGuests: tier.maxGuests,
                        },
                  )
                }
              >
                {isChosen ? t('tier_chosen') : t('tier_pick')}
              </Button>

              <button
                type="button"
                className="bt-tier-more"
                aria-expanded={openId === tier.id}
                onClick={() => setOpenId(openId === tier.id ? null : tier.id)}
              >
                {openId === tier.id ? t('tier_hide') : t('tier_show')}
                <Icon name="chevron" size={13} className={openId === tier.id ? 'up' : undefined} />
              </button>

              <span className="bt-tier-cap muted">
                {t('ph_maxg')} {format.number(cap)} {t('ph_guests')}
              </span>
            </article>
          )
        })}
      </div>

      {open !== null && (
        <div className="bt-tierpanel">
          <button
            type="button"
            className="bt-tierpanel-x"
            onClick={() => setOpenId(null)}
            aria-label={t('c_close')}
          >
            <Icon name="cross" size={14} />
          </button>

          <div className="bt-tierpanel-head">
            {open.isPopular && <span className="bt-tier-badge static">{t('tier_popular')}</span>}
            <h3>{pick(open.name, locale, open.key)}</h3>
            <p className="bt-tier-price">
              {formatMoney(open.priceMinor, open.currency, locale)}
              <span className="bt-tier-unit">
                {open.pricingMode === 'per_guest' ? t('c_pp') : t('tier_flat')}
              </span>
            </p>
            {pickOptional(open.tagline, locale) !== null && (
              <p className="muted">{pickOptional(open.tagline, locale)}</p>
            )}
          </div>

          <div className="bt-tierpanel-body">
            <div className="bt-tierpanel-media">
              <Photo src={hero?.url} alt="" radius={12} style={{ height: 190 }} />
            </div>

            <div className="bt-tierpanel-main">
              {/* Facts come from the activity: one tour, one departure board. */}
              <dl className="bt-tierfacts">
                {timeSlots.length > 0 && (
                  <div>
                    <dt>{t('tier_departs')}</dt>
                    <dd>{timeSlots.join(' · ')}</dd>
                  </div>
                )}
                {area !== null && (
                  <div>
                    <dt>{t('tier_location')}</dt>
                    <dd>{area}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('pd_fact_group')}</dt>
                  <dd>
                    1 – {format.number(open.maxGuests ?? maxGuests)}
                  </dd>
                </div>
                {duration !== null && (
                  <div>
                    <dt>{t('pd_fact_duration')}</dt>
                    <dd>{duration}</dd>
                  </div>
                )}
              </dl>

              <div className="bt-tiercols">
                <TierList title={t('tier_highlights')} items={open.highlights} locale={locale} icon="check" />
                <TierList title={t('tier_details')} items={open.details} locale={locale} icon="book" />
                <TierList title={t('tier_notes')} items={open.notes} locale={locale} icon="shield" />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

function TierList({
  title,
  items,
  locale,
  icon,
}: {
  title: string
  items: readonly { [k: string]: string }[]
  locale: Locale
  icon: IconName
}) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="bt-tiercol-h">{title}</h4>
      <ul className="bt-tiercol-list">
        {items.map((entry, i) => (
          <li key={`${title}-${i}`}>
            <Icon
              name={icon}
              size={13}
              color={icon === 'shield' ? 'var(--orange-deep)' : 'var(--forest)'}
            />
            {pick(entry, locale, '')}
          </li>
        ))}
      </ul>
    </div>
  )
}
