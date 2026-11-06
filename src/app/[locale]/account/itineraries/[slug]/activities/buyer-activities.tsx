'use client'

/**
 * «فعاليات جدولي» — the interactive part. Holds the buyer's choices (arrival,
 * party, which activities, package, time) and asks the server for the price
 * after each change; every amount shown is the server's (`quoteBuyerAction`).
 * «احجز كل الفعاليات» / «أضف المختار» put the lines in the existing cart and
 * open the existing checkout.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { Money } from '@/components/currency/currency-context'
import { Photo } from '@/components/ui'
import { BaliIcon } from '@/components/ui/bali-icon'
import { Link, useRouter } from '@/i18n/routing'
import type { BuyerQuote } from '@/lib/itineraries/buyer'

import { bookBuyerAction, quoteBuyerAction, type BuyerActionError } from './actions'

const SAR = 'SAR'

export interface BuyerActivityView {
  activityId: string
  href: string
  dayNumber: number
  dayTitle: string | null
  name: string
  blurb: string | null
  duration: string | null
  image: { url: string; srcSetAvif?: string | null; srcSetWebp?: string | null } | null
  timeSlots: string[]
  packages: { id: string; name: string }[]
}

interface Choice {
  on: boolean
  packageId: string | null
  time: string | null
}

function todayBali(): string {
  // Bali is UTC+8 all year.
  return new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10)
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (next: number) => void
}) {
  const t = useTranslations()
  return (
    <div className="bact-step">
      <span className="bact-step-l">{label}</span>
      <div className="bact-step-c">
        <button
          type="button"
          aria-label={t('bact_less', { what: label })}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <output aria-live="polite" dir="ltr">
          {value}
        </output>
        <button
          type="button"
          aria-label={t('bact_more', { what: label })}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  )
}

export function BuyerActivities({
  slug,
  activities,
  initialQuote,
  pct,
  eligible,
  preview,
  driverVisible,
  freeDays,
}: {
  slug: string
  activities: BuyerActivityView[]
  initialQuote: BuyerQuote
  pct: number
  eligible: boolean
  preview: boolean
  driverVisible: boolean
  freeDays: { dayNumber: number; title: string | null }[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [arrival, setArrival] = useState('')
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [driver, setDriver] = useState(false)
  const [choices, setChoices] = useState<Record<string, Choice>>(() =>
    Object.fromEntries(
      activities.map((act) => [
        act.activityId,
        { on: true, packageId: act.packages[0]?.id ?? null, time: act.timeSlots[0] ?? null },
      ]),
    ),
  )
  const [quote, setQuote] = useState<BuyerQuote>(initialQuote)
  const [pricing, startPricing] = useTransition()
  const [booking, startBooking] = useTransition()
  const [error, setError] = useState<{ code: BuyerActionError; failed?: string[] } | null>(null)
  const [done, setDone] = useState<number | null>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const selection = useMemo(
    () => ({
      arrival: arrival === '' ? null : arrival,
      adults,
      children,
      driver,
      picks: activities
        .filter((act) => choices[act.activityId]?.on)
        .map((act) => ({
          activityId: act.activityId,
          packageId: choices[act.activityId]?.packageId ?? null,
          time: choices[act.activityId]?.time ?? null,
        })),
    }),
    [activities, adults, arrival, children, choices, driver],
  )

  // Re-price on every change (light debounce); the first render uses the server's quote.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const timer = window.setTimeout(() => {
      startPricing(async () => {
        const result = await quoteBuyerAction(slug, selection)
        if (result.ok) setQuote(result.quote)
      })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [selection, slug])

  const update = (id: string, patch: Partial<Choice>) => {
    setDone(null)
    setChoices((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }))
  }
  const setAll = (on: boolean) =>
    setChoices((prev) =>
      Object.fromEntries(Object.entries(prev).map(([id, c]) => [id, { ...c, on }])),
    )

  const chosenCount = selection.picks.length
  const lineOf = (id: string) => quote.lines.find((line) => line.activityId === id)
  const allSaving = quote.allDiscountMinor
  const nearlyAll = !quote.complete && quote.missing > 0 && quote.missing <= 2 && chosenCount > 0

  const book = (mode: 'all' | 'picked') => {
    setError(null)
    if (arrival === '') {
      setError({ code: 'no_date' })
      dateRef.current?.focus()
      dateRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    if (mode === 'all') setAll(true)
    startBooking(async () => {
      const result = await bookBuyerAction(slug, selection, mode)
      if (result.ok) {
        setQuote(result.quote)
        setDone(result.added)
        router.refresh()
      } else {
        setError({ code: result.error, failed: result.failed })
      }
    })
  }

  const errorText = (code: BuyerActionError) => t(`bact_err_${code}`)
  const failedNames = (error?.failed ?? [])
    .map((id) => activities.find((act) => act.activityId === id)?.name)
    .filter(Boolean)
    .join('، ')

  const byDay = [
    ...activities.map((act) => ({ kind: 'act' as const, dayNumber: act.dayNumber, act })),
    ...freeDays.map((day) => ({ kind: 'free' as const, dayNumber: day.dayNumber, day })),
  ].sort((a, b) => a.dayNumber - b.dayNumber)

  return (
    <div className="bact-grid">
      <div className="bact-main">
        <section className="itp-card bact-setup" aria-labelledby="bact-setup-t">
          <h2 className="itp-h" id="bact-setup-t">
            <span className="bact-n" aria-hidden="true">
              1
            </span>
            {t('bact_setup_t')}
          </h2>
          <div className="bact-setup-row">
            <label className="bact-date">
              <span>{t('bact_arrival')}</span>
              <input
                ref={dateRef}
                type="date"
                min={todayBali()}
                value={arrival}
                aria-invalid={error?.code === 'no_date' || undefined}
                onChange={(event) => {
                  setArrival(event.target.value)
                  setError(null)
                  setDone(null)
                }}
              />
              <small className="muted">{t('bact_arrival_b')}</small>
            </label>
            <Stepper
              label={t('bact_adults')}
              value={adults}
              min={1}
              max={20}
              onChange={setAdults}
            />
            <Stepper
              label={t('bact_children')}
              value={children}
              min={0}
              max={20}
              onChange={setChildren}
            />
          </div>
        </section>

        <section className="bact-all" aria-labelledby="bact-all-t">
          <div className="bact-all-art" aria-hidden="true">
            <BaliIcon name="ticket" size={34} />
          </div>
          <div className="bact-all-text">
            <h2 id="bact-all-t">{t('bact_all_t', { n: activities.length })}</h2>
            <p>
              {eligible && pct > 0
                ? t('bact_all_b', { pct })
                : preview
                  ? t('bact_all_b_preview', { pct })
                  : t('bact_all_b_used')}
            </p>
            <p className="bact-all-price">
              {allSaving > 0 && (
                <s>
                  <Money
                    key={quote.allSubtotalMinor}
                    minor={quote.allSubtotalMinor}
                    currency={SAR}
                  />
                </s>
              )}{' '}
              <b>
                <Money
                  key={quote.allSubtotalMinor - allSaving}
                  minor={quote.allSubtotalMinor - allSaving}
                  currency={SAR}
                />
              </b>
              <small className="muted"> · {t('bact_for_party', { n: adults + children })}</small>
            </p>
          </div>
          <button
            type="button"
            className="btn btn-orange bact-all-cta"
            onClick={() => book('all')}
            disabled={booking || preview}
          >
            {allSaving > 0
              ? t.rich('bact_all_cta_save', {
                  amount: () => <Money key={allSaving} minor={allSaving} currency={SAR} />,
                })
              : t('bact_all_cta')}
          </button>
        </section>

        <section className="itp-card" aria-labelledby="bact-list-t">
          <div className="bact-list-head">
            <h2 className="itp-h" id="bact-list-t">
              <span className="bact-n" aria-hidden="true">
                2
              </span>
              {t('bact_list_t')}
            </h2>
            <button
              type="button"
              className="bact-link"
              onClick={() => setAll(chosenCount < activities.length)}
            >
              {chosenCount < activities.length ? t('bact_select_all') : t('bact_clear')}
            </button>
          </div>
          <ol className="bact-days" role="list">
            {byDay.map((entry) => {
              if (entry.kind === 'free') {
                return (
                  <li key={`free-${entry.dayNumber}`} className="bact-day is-free">
                    <span className="bact-day-n">
                      <b dir="ltr">{String(entry.dayNumber).padStart(2, '0')}</b>
                      <span>{t('itd_day_ord', { n: String(entry.dayNumber) })}</span>
                    </span>
                    <p className="muted">{entry.day.title ?? t('bact_free_day')}</p>
                  </li>
                )
              }
              const act = entry.act
              const choice = choices[act.activityId]!
              const line = lineOf(act.activityId)
              return (
                <li
                  key={act.activityId}
                  className={`bact-day${choice.on ? ' is-on' : ''}${line?.issue ? ' has-issue' : ''}`}
                >
                  <span className="bact-day-n">
                    <b dir="ltr">{String(act.dayNumber).padStart(2, '0')}</b>
                    <span>{t('itd_day_ord', { n: String(act.dayNumber) })}</span>
                  </span>
                  <article className="bact-act">
                    <label className="bact-act-pick">
                      <input
                        type="checkbox"
                        checked={choice.on}
                        onChange={(event) => update(act.activityId, { on: event.target.checked })}
                      />
                      <span className="bact-act-media">
                        <Photo
                          src={act.image?.url}
                          srcSetAvif={act.image?.srcSetAvif}
                          srcSetWebp={act.image?.srcSetWebp}
                          sizes="120px"
                          alt=""
                        />
                        <span className="bact-check" aria-hidden="true">
                          ✓
                        </span>
                      </span>
                      <span className="bact-act-text">
                        <small className="bact-fit">
                          {t('bact_fits_day', { n: act.dayNumber })}
                          {act.dayTitle ? ` · ${act.dayTitle}` : ''}
                        </small>
                        <b>{act.name}</b>
                        {act.blurb && <span className="bact-blurb">{act.blurb}</span>}
                        {act.duration && (
                          <span className="bact-meta">
                            <BaliIcon name="clock" size={14} /> {act.duration}
                          </span>
                        )}
                      </span>
                    </label>
                    <div className="bact-act-side">
                      <span className="bact-price">
                        {line?.totalMinor != null ? (
                          <Money key={line.totalMinor} minor={line.totalMinor} currency={SAR} />
                        ) : (
                          '—'
                        )}
                      </span>
                      {line?.date && (
                        <small className="muted" dir="ltr">
                          {line.date}
                        </small>
                      )}
                    </div>
                    {choice.on && (act.packages.length > 1 || act.timeSlots.length > 1) && (
                      <div className="bact-act-opts">
                        {act.packages.length > 1 && (
                          <label>
                            <span>{t('bact_package')}</span>
                            <select
                              value={choice.packageId ?? ''}
                              onChange={(event) =>
                                update(act.activityId, { packageId: event.target.value || null })
                              }
                            >
                              {act.packages.map((pkg) => (
                                <option key={pkg.id} value={pkg.id}>
                                  {pkg.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        {act.timeSlots.length > 1 && (
                          <label>
                            <span>{t('bact_time')}</span>
                            <select
                              dir="ltr"
                              value={choice.time ?? ''}
                              onChange={(event) =>
                                update(act.activityId, { time: event.target.value || null })
                              }
                            >
                              {act.timeSlots.map((slot) => (
                                <option key={slot} value={slot}>
                                  {slot}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                      </div>
                    )}
                    {line?.issue && (
                      <p className="bact-issue" role="status">
                        {t('bact_issue')}
                      </p>
                    )}
                  </article>
                </li>
              )
            })}
          </ol>
        </section>

        {driverVisible && (
          <section className="itp-card bact-driver" aria-labelledby="bact-driver-t">
            <label className="bact-driver-row">
              <input
                type="checkbox"
                checked={driver}
                onChange={(event) => setDriver(event.target.checked)}
              />
              <span>
                <b id="bact-driver-t">{t('bact_driver_t')}</b>
                <small className="muted">{t('bact_driver_b')}</small>
              </span>
            </label>
          </section>
        )}
      </div>

      <aside className="bact-sum" aria-label={t('bact_sum_t')} aria-busy={pricing || undefined}>
        <h2 className="bact-sum-h">{t('bact_sum_t')}</h2>
        <dl>
          <div>
            <dt>{t('bact_sum_acts', { n: chosenCount })}</dt>
            <dd>
              <Money key={quote.subtotalMinor} minor={quote.subtotalMinor} currency={SAR} />
            </dd>
          </div>
          {quote.discountMinor > 0 && (
            <div className="is-save">
              <dt>{t('bact_sum_disc', { pct })}</dt>
              <dd>
                −<Money key={quote.discountMinor} minor={quote.discountMinor} currency={SAR} />
              </dd>
            </div>
          )}
          <div className="is-total">
            <dt>{t('bact_sum_total')}</dt>
            <dd>
              <Money key={quote.totalMinor} minor={quote.totalMinor} currency={SAR} />
            </dd>
          </div>
        </dl>
        {quote.discountMinor > 0 && (
          <p className="bact-saved" role="status">
            {t.rich('bact_saved', {
              amount: () => (
                <Money key={quote.discountMinor} minor={quote.discountMinor} currency={SAR} />
              ),
            })}
          </p>
        )}
        {nearlyAll && eligible && allSaving > 0 && (
          <button type="button" className="bact-nudge" onClick={() => setAll(true)}>
            {t.rich('bact_nudge', {
              n: quote.missing,
              amount: () => <Money key={allSaving} minor={allSaving} currency={SAR} />,
            })}
          </button>
        )}
        {error && (
          <p className="bact-err" role="alert">
            {errorText(error.code)}
            {failedNames !== '' && ` (${failedNames})`}
          </p>
        )}
        {done !== null ? (
          <div className="bact-done" role="status">
            <p>
              <BaliIcon name="unlock" size={18} /> {t('bact_added', { n: done })}
            </p>
            <Link href="/checkout" className="btn btn-orange">
              {t('bact_checkout')}
            </Link>
            <Link href="/my-trip" className="bact-link">
              {t('bact_view_cart')}
            </Link>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary bact-sum-cta"
            disabled={booking || preview || chosenCount === 0}
            onClick={() => book(quote.complete ? 'all' : 'picked')}
          >
            {booking ? t('bact_adding') : t('bact_add_picked', { n: chosenCount })}
          </button>
        )}
        <p className="bact-fine muted">{t('bact_fine')}</p>
      </aside>
    </div>
  )
}
