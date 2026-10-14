'use client'

/**
 * Activity booking — v3 screen 06 (prototype activity.html, booking.js,
 * handoff "Pricing & add-ons").
 *
 * One client state shared by three places on the page through context:
 *   - <PackageCards>  the selectable package cards + compare table (main column);
 *   - <BookingBox>    the numbered booking form in the sticky aside (#book);
 *   - <MobileBookBar> the bottom bar on phones while the form is off screen.
 *
 * The live price is `priceBooking` from '@/lib/booking/price' — the very
 * function the server uses in `buildQuote` — so the summary and the charge
 * cannot disagree. It is still display only: the action sends ids, dates,
 * people and add-on quantities, and the server prices them again.
 */

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Calendar, type CalendarRange } from '@/components/booking/calendar'
import { formatPrice } from '@/components/bt/card'
import { Stepper } from '@/components/shared/stepper'
import { Modal } from '@/components/shared/modal'
import { useToast } from '@/components/shared/toast'
import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/routing'
import { isWithinLeadTime, todayInBali, type VehicleClass } from '@/lib/booking-rules'
import {
  addonState,
  driverDays,
  priceBooking,
  resolveAddons,
  type AddonPricing,
  type AddonRule,
  type PackagePricing,
  type PackageRule,
} from '@/lib/booking/price'

import { bookActivityAction } from './actions'
import type { BookingField } from './booking-contract'

// ---------------------------------------------------------------------------
// Data handed over by the server (already localized)
// ---------------------------------------------------------------------------

export type BookingPackage = {
  id: string
  name: string
  tagline: string | null
  priceMinor: number
  pricing: PackagePricing
  groupMax: number | null
  maxGuests: number | null
  includes: string[]
  excludes: string[]
  includesAddons: string[]
  available: boolean
  popular: boolean
}

export type BookingAddon = {
  id: string
  name: string
  description: string | null
  priceMinor: number
  currency: string
  pricing: AddonPricing
  maxQty: number | null
  onlyPackages: string[]
  requiresAddonId: string | null
  available: boolean
}

export type BookingVehicle = {
  vehicleClass: VehicleClass
  label: string
  dayRateMinor: number
  currency: string
}

export type BookingData = {
  activityId: string
  currency: string
  /** Price of the activity itself, used when it has no packages. */
  basePriceMinor: number
  maxGuests: number
  leadTimeHours: number
  timeSlots: string[]
  multiDay: boolean
  packages: BookingPackage[]
  addons: BookingAddon[]
  vehicles: BookingVehicle[]
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type State = {
  pkg: string | null
  date: string | null
  endDate: string | null
  time: string | null
  people: number
  /** Selected add-ons → quantity (1 unless per_qty). */
  addons: Record<string, number>
  driver: boolean
}

type Errors = Partial<Record<BookingField, string>>

type Ctx = {
  data: BookingData
  state: State
  errors: Errors
  busy: boolean
  bump: number
  today: string
  price: ReturnType<typeof priceBooking>
  pkg: PackageRule
  pkgInfo: BookingPackage | null
  cap: number
  driverAvailable: boolean
  setPackage: (id: string, el?: HTMLElement | null) => void
  setDate: (value: string) => void
  setRange: (value: CalendarRange) => void
  setTime: (value: string) => void
  setPeople: (value: number) => void
  toggleAddon: (id: string, on: boolean) => void
  setAddonQty: (id: string, qty: number) => void
  setDriver: (on: boolean) => void
  submit: (mode: 'trip' | 'book') => void
  confirmDriver: (withDriver: boolean) => void
  modalOpen: boolean
  closeModal: () => void
  money: (minor: number) => string
}

const BookingContext = createContext<Ctx | null>(null)

function useBooking(): Ctx {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking outside <BookingProvider>')
  return ctx
}

const STEP_ID: Record<BookingField, string> = {
  package: 'bk-s-pkg',
  date: 'bk-s-date',
  time: 'bk-s-time',
  people: 'bk-s-ppl',
  addons: 'bk-s-add',
  driver: 'bk-s-drv',
  form: 'bk-form',
}

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function toRule(pkg: BookingPackage | null, data: BookingData): PackageRule {
  if (!pkg) {
    return {
      id: null,
      priceMinor: data.basePriceMinor,
      currency: data.currency,
      pricing: 'per_person',
      groupMax: null,
      includesAddons: [],
    }
  }
  return {
    id: pkg.id,
    priceMinor: pkg.priceMinor,
    currency: data.currency,
    pricing: pkg.pricing,
    groupMax: pkg.groupMax,
    includesAddons: pkg.includesAddons,
  }
}

function addonRules(data: BookingData): AddonRule[] {
  return data.addons.map((a) => ({
    id: a.id,
    priceMinor: a.priceMinor,
    currency: a.currency,
    pricing: a.pricing,
    maxQty: a.maxQty,
    onlyPackages: a.onlyPackages,
    requiresAddonId: a.requiresAddonId,
    available: a.available,
  }))
}

/** Drop every pick the rules no longer allow (package change, prerequisite off). */
function prune(state: State, data: BookingData): State {
  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  const picks = Object.entries(state.addons).map(([id, qty]) => ({ id, qty }))
  const { accepted } = resolveAddons(addonRules(data), toRule(pkgInfo, data), picks)
  return { ...state, addons: Object.fromEntries(accepted.map((p) => [p.id, p.qty])) }
}

function capFor(pkg: BookingPackage | null, data: BookingData): number {
  return Math.max(1, Math.min(pkg?.maxGuests ?? data.maxGuests, data.maxGuests))
}

function priceOf(state: State, data: BookingData) {
  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  const days = state.date ? driverDays(data.multiDay, state.date, state.endDate) : 1
  return priceBooking({
    pkg: toRule(pkgInfo, data),
    addons: addonRules(data),
    picks: Object.entries(state.addons).map(([id, qty]) => ({ id, qty })),
    people: Math.max(1, state.people),
    driver: state.driver ? { vehicles: data.vehicles, days } : null,
  })
}

export function BookingProvider({ data, children }: { data: BookingData; children: ReactNode }) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()
  const { toast } = useToast()

  const firstPkg = data.packages.find((p) => p.available) ?? null
  const [state, setState] = useState<State>(() => ({
    pkg: firstPkg?.id ?? null,
    date: null,
    endDate: null,
    time: data.timeSlots.length === 1 ? (data.timeSlots[0] ?? null) : null,
    people: Math.min(2, capFor(firstPkg, data)),
    addons: {},
    driver: false,
  }))
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [bump, setBump] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [today] = useState(() => todayInBali())

  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  const pkg = toRule(pkgInfo, data)
  const cap = capFor(pkgInfo, data)
  const price = useMemo(() => priceOf(state, data), [state, data])
  const vehicle = data.vehicles.find(
    (v) => v.vehicleClass === price.vehicleClass && v.currency === data.currency,
  )
  const driverAvailable = vehicle !== undefined

  const money = (minor: number) => formatPrice(minor, data.currency, locale)

  /** Every change goes through here: prune add-ons, clamp people, bump the total. */
  function update(patch: Partial<State>, clear?: BookingField) {
    let next = prune({ ...state, ...patch }, data)
    const nextCap = capFor(data.packages.find((p) => p.id === next.pkg) ?? null, data)
    if (next.people > nextCap) next = { ...next, people: nextCap }
    // Handoff motion: the total "bumps" only when it actually changes.
    if (priceOf(next, data).totalMinor !== price.totalMinor) setBump((n) => n + 1)
    setState(next)
    if (clear) setErrors((e) => ({ ...e, [clear]: undefined }))
  }

  function validate(): Errors {
    const next: Errors = {}
    if (!state.date) next.date = t('act_err_date')
    else if (data.multiDay && !state.endDate) next.date = t('act_err_range')
    if (data.timeSlots.length > 0 && !state.time) next.time = t('act_err_time')
    if (!(state.people > 0)) next.people = t('act_err_people')
    return next
  }

  function showErrors(next: Errors) {
    setErrors(next)
    const first = (['package', 'date', 'time', 'people', 'addons', 'driver', 'form'] as const).find(
      (field) => next[field],
    )
    if (!first) return
    document
      .getElementById(STEP_ID[first])
      ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' })
  }

  const SERVER_MESSAGE: Record<string, string> = {
    missing_date: 'act_err_date',
    date_in_past: 'act_err_past',
    invalid_date_range: 'act_err_range',
    missing_time: 'act_err_time',
    invalid_time_slot: 'act_err_time',
    lead_time_passed: 'act_err_lead',
    guests_exceed_max: 'act_err_people_max',
    invalid_quantity: 'act_err_people',
    invalid_addon: 'act_err_addon',
    package_unavailable: 'act_err_package',
    unknown_item: 'act_err_package',
    driver_full: 'act_err_driver_full',
    closed: 'bk_closed_t',
  }

  async function save(mode: 'trip' | 'book', withDriver: boolean) {
    setBusy(true)
    try {
      const result = await bookActivityAction({
        activityId: data.activityId,
        packageId: state.pkg,
        date: state.date,
        endDate: data.multiDay ? state.endDate : null,
        time: state.time,
        people: state.people,
        addons: Object.entries(state.addons).map(([id, qty]) => ({ id, qty })),
        driver: withDriver,
      })
      if (!result.ok) {
        const message = t(SERVER_MESSAGE[result.code] ?? 'c_error')
        if (result.field === 'form') toast(message, { error: true })
        else showErrors({ [result.field]: message })
        return
      }
      window.dispatchEvent(new Event(CART_CHANGED_EVENT))
      if (mode === 'book') {
        router.push('/checkout')
        return
      }
      toast(t('act_added'), { link: { href: CART_HREF, label: t('bt_my_trip') } })
    } catch {
      toast(t('c_error'), { error: true })
    } finally {
      setBusy(false)
    }
  }

  function submit(mode: 'trip' | 'book') {
    const next = validate()
    if (Object.keys(next).length > 0) {
      showErrors(next)
      toast(t('act_err_required'), { error: true })
      return
    }
    setErrors({})
    // "Book now" offers a driver once, when none is chosen and one exists.
    if (mode === 'book' && !state.driver && driverAvailable) {
      setModalOpen(true)
      return
    }
    void save(mode, state.driver)
  }

  const ctx: Ctx = {
    data,
    state,
    errors,
    busy,
    bump,
    today,
    price,
    pkg,
    pkgInfo,
    cap,
    driverAvailable,
    money,
    modalOpen,
    closeModal: () => setModalOpen(false),
    setPackage: (id, el) => {
      const target = data.packages.find((p) => p.id === id)
      if (!target || !target.available) return
      update({ pkg: id }, 'package')
      if (el && typeof el.animate === 'function' && !reducedMotion()) {
        el.animate([{ transform: 'scale(.97)' }, { transform: 'translateY(-2px)' }], {
          duration: 260,
          easing: 'cubic-bezier(.22,.8,.24,1)',
        })
      }
    },
    setDate: (value) => {
      // A slot that the lead time closes on the new day is dropped.
      const keep =
        state.time !== null && isWithinLeadTime(value, state.time, data.leadTimeHours)
          ? state.time
          : data.timeSlots.length === 1
            ? state.time
            : null
      update({ date: value, endDate: null, time: keep }, 'date')
    },
    setRange: ([start, end]) => update({ date: start, endDate: end }, end ? 'date' : undefined),
    setTime: (value) => update({ time: value }, 'time'),
    setPeople: (value) => update({ people: value }, 'people'),
    toggleAddon: (id, on) => {
      const addons = { ...state.addons }
      if (on) addons[id] = 1
      else delete addons[id]
      update({ addons }, 'addons')
    },
    setAddonQty: (id, qty) => update({ addons: { ...state.addons, [id]: qty } }, 'addons'),
    setDriver: (on) => update({ driver: on }, 'driver'),
    submit,
    confirmDriver: (withDriver) => {
      setModalOpen(false)
      if (withDriver) update({ driver: true }, 'driver')
      void save('book', withDriver)
    },
  }

  return <BookingContext.Provider value={ctx}>{children}</BookingContext.Provider>
}

// ---------------------------------------------------------------------------
// Packages (main column)
// ---------------------------------------------------------------------------

function perLabel(t: ReturnType<typeof useTranslations>, pkg: BookingPackage) {
  return pkg.pricing === 'per_group'
    ? pkg.groupMax
      ? t('act_per_group_max', { n: pkg.groupMax })
      : t('act_per_group')
    : t('act_per_person')
}

export function PackageCards() {
  const t = useTranslations()
  const { data, state, setPackage, money } = useBooking()
  const [compare, setCompare] = useState(false)

  const features = [...new Set(data.packages.flatMap((p) => [...p.includes, ...p.excludes]))]

  return (
    <>
      <div className="row between">
        <h2>{t('act_pkgs_t')}</h2>
        {data.packages.length > 1 && features.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={compare}
            aria-controls="act-cmp"
            onClick={() => setCompare((open) => !open)}
          >
            <Icon name="list" size={16} /> {t('act_pkgs_compare')}
          </button>
        ) : null}
      </div>
      <div className="pkgs" role="radiogroup" aria-label={t('act_pkgs_label')}>
        {data.packages.map((p) => {
          const on = state.pkg === p.id
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              className="pkg"
              aria-checked={on}
              aria-disabled={!p.available || undefined}
              disabled={!p.available}
              onClick={(event) => setPackage(p.id, event.currentTarget)}
            >
              {p.popular ? <span className="badge-top">{t('act_pkg_popular')}</span> : null}
              <span className="radio" aria-hidden="true">
                {on ? <Icon name="check" size={14} stroke={3} /> : null}
              </span>
              <span className="pname">{p.name}</span>
              {p.tagline ? <span className="muted ptag">{p.tagline}</span> : null}
              <span className="pprice">
                <span className="price" dir="ltr">
                  {money(p.priceMinor)}
                </span>{' '}
                <small>{perLabel(t, p)}</small>
              </span>
              {p.includes.length + p.excludes.length > 0 ? (
                <ul>
                  {p.includes.map((line) => (
                    <li key={`i-${line}`}>
                      <Icon name="check" size={15} stroke={2.4} />
                      <span>{line}</span>
                    </li>
                  ))}
                  {p.excludes.map((line) => (
                    <li key={`x-${line}`} className="no">
                      <Icon name="cross" size={15} stroke={2.2} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!p.available ? <span className="why">{t('act_pkg_unavailable')}</span> : null}
            </button>
          )
        })}
      </div>
      {compare ? (
        <div id="act-cmp" className="stack" style={{ gap: 8 }}>
          <div className="cmp-wrap">
            <table className="cmp">
              <thead>
                <tr>
                  <th scope="col">{t('act_cmp_feature')}</th>
                  {data.packages.map((p) => (
                    <th key={p.id} scope="col">
                      {p.name}
                      <br />
                      <span className="num" dir="ltr">
                        {money(p.priceMinor)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => {
                  const has = data.packages.map((p) => p.includes.includes(feature))
                  const diff = has.some(Boolean) && has.some((x) => !x)
                  return (
                    <tr key={feature} className={diff ? 'diff' : undefined}>
                      <td>{feature}</td>
                      {has.map((yes, i) => (
                        <td key={i} className={yes ? 'y' : 'n'}>
                          <Icon name={yes ? 'check' : 'minus'} size={18} stroke={2.4} />
                          <span className="sr-only">
                            {yes ? t('act_included') : t('act_not_included')}
                          </span>
                        </td>
                      ))}
                    </tr>
                  )
                })}
                <tr>
                  <td>{t('act_cmp_pricing')}</td>
                  {data.packages.map((p) => (
                    <td key={p.id}>
                      {p.pricing === 'per_group' ? t('act_cmp_group') : t('act_cmp_person')}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td />
                  {data.packages.map((p) => (
                    <td key={p.id}>
                      <button
                        type="button"
                        className={
                          state.pkg === p.id ? 'btn btn-sm btn-forest' : 'btn btn-sm btn-ghost'
                        }
                        disabled={!p.available}
                        onClick={() => setPackage(p.id)}
                      >
                        {state.pkg === p.id ? t('act_cmp_selected') : t('act_cmp_choose')}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <small className="muted">{t('act_cmp_hint')}</small>
        </div>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Booking box (aside)
// ---------------------------------------------------------------------------

function StepError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null
  return (
    <span className="err" id={id} role="alert">
      <Icon name="alert" size={16} /> {message}
    </span>
  )
}

export function BookingBox() {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const uid = useId()
  const b = useBooking()
  const { data, state, errors, price, money, pkgInfo, cap } = b

  const intlLocale = locale === 'ar' ? 'ar-EG' : locale
  const fmtDate = (value: string) =>
    new Intl.DateTimeFormat(intlLocale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
      new Date(`${value}T00:00:00Z`),
    )

  // The cheapest bookable package (or the base price) heads the box.
  const from = data.packages.length
    ? data.packages.reduce<BookingPackage | null>(
        (min, p) => (p.available && (!min || p.priceMinor < min.priceMinor) ? p : min),
        null,
      )
    : null
  const fromMinor = from?.priceMinor ?? data.basePriceMinor

  const slotOpen = (slot: string) =>
    !state.date || isWithinLeadTime(state.date, slot, data.leadTimeHours)
  const dayUnavailable = (day: string) =>
    data.timeSlots.length > 0
      ? data.timeSlots.every((slot) => !isWithinLeadTime(day, slot, data.leadTimeHours))
      : !isWithinLeadTime(day, '00:00', data.leadTimeHours)

  const vehicle = data.vehicles.find(
    (v) => v.vehicleClass === price.vehicleClass && v.currency === data.currency,
  )
  const days = state.date ? driverDays(data.multiDay, state.date, state.endDate) : 1

  let n = 0
  const step = () => ++n
  const hasPackages = data.packages.length > 0

  const addonById = new Map(data.addons.map((a) => [a.id, a]))
  const lineLabel = (line: (typeof price.lines)[number]) => {
    if (line.kind === 'package') {
      const name = pkgInfo?.name ?? t('act_base_line')
      return pkgInfo?.pricing === 'per_group'
        ? t('act_line_groups', { name, n: line.quantity })
        : t('act_line_people', { name, n: line.quantity })
    }
    if (line.kind === 'driver') {
      return t('act_line_driver', { vehicle: vehicle?.label ?? '', n: line.quantity })
    }
    const addon = line.refId ? addonById.get(line.refId) : undefined
    const name = addon?.name ?? ''
    if (line.included) return `${name} · ${t('act_included')}`
    return line.quantity > 1 ? `${name} × ${line.quantity}` : name
  }

  const selected = new Set(Object.keys(state.addons))
  const perAddon = (a: BookingAddon) =>
    a.pricing === 'per_person'
      ? t('act_addon_pp')
      : a.pricing === 'per_qty'
        ? t('act_addon_unit')
        : t('act_addon_booking')

  return (
    <form
      className="panel bk"
      id="bk-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        b.submit('book')
      }}
      aria-labelledby={`${uid}-h`}
    >
      <div className="bk-head">
        <span id={`${uid}-h`}>
          {t('act_from')}
          <br />
          <small>{from ? perLabel(t, from) : t('act_per_person')}</small>
        </span>
        <b className="price" dir="ltr">
          {money(fromMinor)}
        </b>
      </div>

      <div className="bk-body">
        {hasPackages ? (
          <div className={`bstep ok${errors.package ? ' has-error' : ''}`} id={STEP_ID.package}>
            <label className="lbl" htmlFor={`${uid}-pkg`}>
              <span className="n">{step()}</span>
              {t('act_s_package')}
            </label>
            <select
              id={`${uid}-pkg`}
              className="select"
              value={state.pkg ?? ''}
              onChange={(event) => b.setPackage(event.target.value)}
            >
              {data.packages.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {`${p.name} — ${money(p.priceMinor)} ${perLabel(t, p)}`}
                </option>
              ))}
            </select>
            <StepError id={`${uid}-pkg-err`} message={errors.package} />
          </div>
        ) : null}

        <div
          className={`bstep${state.date && (!data.multiDay || state.endDate) ? ' ok' : ''}${errors.date ? ' has-error' : ''}`}
          id={STEP_ID.date}
        >
          <span className="lbl">
            <span className="n">{step()}</span>
            {data.multiDay ? t('act_s_dates') : t('act_s_date')}
            {state.date ? (
              <span className="muted lbl-out">
                {state.endDate
                  ? `${fmtDate(state.date)} – ${fmtDate(state.endDate)}`
                  : fmtDate(state.date)}
              </span>
            ) : null}
          </span>
          {data.multiDay ? (
            <Calendar
              mode="range"
              today={b.today}
              value={[state.date, state.endDate]}
              onChange={b.setRange}
              isUnavailable={dayUnavailable}
              label={t('act_s_dates')}
              invalid={Boolean(errors.date)}
            />
          ) : (
            <Calendar
              mode="single"
              today={b.today}
              value={state.date}
              onChange={b.setDate}
              isUnavailable={dayUnavailable}
              label={t('act_s_date')}
              invalid={Boolean(errors.date)}
            />
          )}
          <StepError id={`${uid}-date-err`} message={errors.date} />
        </div>

        {data.timeSlots.length > 0 ? (
          <div
            className={`bstep${state.time ? ' ok' : ''}${errors.time ? ' has-error' : ''}`}
            id={STEP_ID.time}
          >
            <span className="lbl" id={`${uid}-time`}>
              <span className="n">{step()}</span>
              {t('act_s_time')}
            </span>
            <div className="slots" role="group" aria-labelledby={`${uid}-time`}>
              {data.timeSlots.map((slot) => {
                const open = slotOpen(slot)
                return (
                  <button
                    key={slot}
                    type="button"
                    className="slot"
                    dir="ltr"
                    aria-pressed={state.time === slot}
                    disabled={!open}
                    onClick={() => b.setTime(slot)}
                  >
                    {slot}
                    {!open ? <small>{t('act_slot_closed')}</small> : null}
                  </button>
                )
              })}
            </div>
            <StepError id={`${uid}-time-err`} message={errors.time} />
          </div>
        ) : null}

        <div
          className={`bstep${state.people > 0 ? ' ok' : ''}${errors.people ? ' has-error' : ''}`}
          id={STEP_ID.people}
        >
          <span className="lbl">
            <span className="n">{step()}</span>
            {t('act_s_people')}
          </span>
          <div className="row between" style={{ flexWrap: 'nowrap' }}>
            <Stepper
              value={state.people}
              onChange={b.setPeople}
              min={1}
              max={cap}
              label={t('act_s_people')}
              decreaseLabel={t('c_qty_dec')}
              increaseLabel={t('c_qty_inc')}
            />
            <small className="muted">
              {pkgInfo?.pricing === 'per_group'
                ? t('act_ppl_note_group', { n: pkgInfo.groupMax ?? cap })
                : t('act_ppl_note_person', {
                    price: money(pkgInfo?.priceMinor ?? data.basePriceMinor),
                  })}
            </small>
          </div>
          <StepError id={`${uid}-ppl-err`} message={errors.people} />
        </div>

        {data.addons.length > 0 ? (
          <div className={`bstep${errors.addons ? ' has-error' : ''}`} id={STEP_ID.addons}>
            <span className="lbl">
              <span className="n">{step()}</span>
              {t('act_s_addons')}
            </span>
            <div className="stack" style={{ gap: 8 }}>
              {data.addons.map((a) => {
                const rule = addonRules({ ...data, addons: [a] })[0]
                const st = rule
                  ? addonState(rule, b.pkg, selected)
                  : { kind: 'unavailable' as const }
                const included = st.kind === 'included'
                const locked = st.kind !== 'selectable'
                const checked = included || state.addons[a.id] !== undefined
                const why =
                  st.kind === 'included'
                    ? t('act_addon_included')
                    : st.kind === 'not_for_package'
                      ? t('act_addon_not_pkg')
                      : st.kind === 'unavailable'
                        ? t('act_addon_unavailable')
                        : st.kind === 'requires'
                          ? t('act_addon_requires', {
                              name: addonById.get(st.requiresAddonId)?.name ?? '',
                            })
                          : null
                return (
                  <label key={a.id} className={`check addon-row${included ? ' is-included' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={locked}
                      onChange={(event) => b.toggleAddon(a.id, event.target.checked)}
                    />
                    <span className="addon">
                      <b>{a.name}</b>
                      {a.description ? <small>{a.description}</small> : null}
                      {why ? <small className="why">{why}</small> : null}
                      {a.pricing === 'per_qty' && state.addons[a.id] !== undefined ? (
                        <span
                          className="addon-qty"
                          onClick={(event) => event.preventDefault()}
                          role="presentation"
                        >
                          <Stepper
                            size="sm"
                            value={state.addons[a.id] ?? 1}
                            onChange={(qty) => b.setAddonQty(a.id, qty)}
                            min={1}
                            max={a.maxQty ?? 1}
                            label={a.name}
                            decreaseLabel={t('c_qty_dec')}
                            increaseLabel={t('c_qty_inc')}
                          />
                        </span>
                      ) : null}
                    </span>
                    <span className="ad-price">
                      <span dir="ltr">{included ? '—' : `+${money(a.priceMinor)}`}</span>
                      <br />
                      <small className="muted">{perAddon(a)}</small>
                    </span>
                  </label>
                )
              })}
            </div>
            <StepError id={`${uid}-add-err`} message={errors.addons} />
          </div>
        ) : null}

        {b.driverAvailable && vehicle ? (
          <div className={`bstep${errors.driver ? ' has-error' : ''}`} id={STEP_ID.driver}>
            <span className="lbl">
              <span className="n">{step()}</span>
              {t('act_s_driver')}
            </span>
            <label className="drv-toggle">
              <span className="switch">
                <input
                  type="checkbox"
                  checked={state.driver}
                  onChange={(event) => b.setDriver(event.target.checked)}
                />
                <span />
              </span>
              <span className="addon">
                <b>{t('act_driver_add')}</b>
                <small>
                  {data.multiDay && days > 1
                    ? t('act_driver_info_days', { vehicle: vehicle.label, n: state.people, days })
                    : t('act_driver_info', { vehicle: vehicle.label, n: state.people })}
                </small>
              </span>
              <span className="ad-price" dir="ltr">
                +{money(vehicle.dayRateMinor * days)}
              </span>
            </label>
            <StepError id={`${uid}-drv-err`} message={errors.driver} />
          </div>
        ) : null}

        <div className="sum" aria-live="polite">
          <div className="sum-row">
            <span>{t('act_sum_when')}</span>
            <span>
              {state.date
                ? state.endDate
                  ? `${fmtDate(state.date)} – ${fmtDate(state.endDate)}`
                  : fmtDate(state.date)
                : '—'}
              {data.timeSlots.length > 0 ? (
                <>
                  {' · '}
                  <span className="num" dir="ltr">
                    {state.time ?? '—'}
                  </span>
                </>
              ) : null}
            </span>
          </div>
          {price.lines.map((line) => (
            <div className="sum-row" key={`${line.kind}-${line.refId ?? ''}`}>
              <span>{lineLabel(line)}</span>
              <span className="price" dir="ltr">
                {money(line.totalMinor)}
              </span>
            </div>
          ))}
          <div className="sum-total">
            <span>{t('act_sum_total')}</span>
            <b key={b.bump} className={b.bump > 0 ? 'price bump' : 'price'} dir="ltr">
              {money(price.totalMinor)}
            </b>
          </div>
          <small className="muted">{t('act_sum_note')}</small>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <button
            className="btn btn-primary btn-block btn-lg"
            type="submit"
            disabled={b.busy}
            aria-busy={b.busy || undefined}
          >
            {t('act_book_now')}
          </button>
          <button
            className="btn btn-ghost btn-block"
            type="button"
            disabled={b.busy}
            onClick={() => b.submit('trip')}
          >
            <Icon name="suitcase" size={18} /> {t('act_add_trip')}
          </button>
        </div>
        <Link className="muted center bk-help" href="/contact">
          <Icon name="chat" size={15} /> {t('act_questions')}
        </Link>
      </div>

      <DriverModal />
    </form>
  )
}

// ---------------------------------------------------------------------------
// Driver suggestion (confirmation before checkout)
// ---------------------------------------------------------------------------

function DriverModal() {
  const t = useTranslations()
  const titleId = useId()
  const b = useBooking()
  const vehicle = b.data.vehicles.find(
    (v) => v.vehicleClass === b.price.vehicleClass && v.currency === b.data.currency,
  )
  const days = b.state.date ? driverDays(b.data.multiDay, b.state.date, b.state.endDate) : 1
  const addRef = useRef<HTMLButtonElement>(null)
  if (!vehicle) return null
  return (
    <Modal
      open={b.modalOpen}
      onClose={b.closeModal}
      labelledBy={titleId}
      scrimClassName="modal-scrim open"
      panelClassName="modal stack drv-modal"
      initialFocus={addRef}
      showClose={false}
    >
      <span className="drv-ill" aria-hidden="true">
        <Icon name="car" size={30} />
      </span>
      <h2 className="h3" id={titleId}>
        {t('act_drv_modal_t')}
      </h2>
      <p className="muted">{t('act_drv_modal_b', { vehicle: vehicle.label })}</p>
      <div className="sum-row drv-modal-row">
        <span>
          {vehicle.label} · {t('act_days_n', { n: days })}
        </span>
        <b className="price" dir="ltr">
          +{b.money(vehicle.dayRateMinor * days)}
        </b>
      </div>
      <div className="row">
        <button
          ref={addRef}
          type="button"
          className="btn btn-primary"
          onClick={() => b.confirmDriver(true)}
        >
          {t('act_drv_modal_add')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => b.confirmDriver(false)}>
          {t('act_drv_modal_skip')}
        </button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Mobile bottom bar
// ---------------------------------------------------------------------------

export function MobileBookBar() {
  const t = useTranslations()
  const { price, money } = useBooking()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const target = document.getElementById('bk-form')
    if (!target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) => {
      setShow(entry !== undefined && !entry.isIntersecting && window.scrollY > 300)
    })
    observer.observe(target)
    return () => observer.disconnect()
  }, [])

  return (
    <div className={show ? 'mbar show' : 'mbar'} aria-hidden={!show || undefined}>
      <div className="from">
        <small>{t('act_sum_total')}</small>
        <b className="price" dir="ltr">
          {money(price.totalMinor)}
        </b>
      </div>
      <a
        className="btn btn-primary"
        href="#book"
        tabIndex={show ? undefined : -1}
        onClick={(event) => {
          event.preventDefault()
          document
            .getElementById('bk-form')
            ?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' })
        }}
      >
        {t('act_book_now')}
      </a>
    </div>
  )
}
