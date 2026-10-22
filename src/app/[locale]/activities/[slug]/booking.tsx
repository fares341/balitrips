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
import type { FormEvent, ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Calendar, type CalendarRange } from '@/components/booking/calendar'
import { formatPrice } from '@/components/bt/card'
import { Stepper } from '@/components/shared/stepper'
import { Modal } from '@/components/shared/modal'
import { useToast } from '@/components/shared/toast'
import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { Icon, type IconName } from '@/components/ui/icon'
import { CONTACT_EMAIL, whatsappLink } from '@/components/layout/contact-config'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/routing'
import { isWithinLeadTime, todayInBali, type VehicleClass } from '@/lib/booking-rules'
import { FEATURES } from '@/lib/features'
import { showsGroupSize } from '@/lib/content/activity-status'
import {
  addonState,
  driverDays,
  hasChildPricing,
  priceBooking,
  resolveAddons,
  type AddonPricing,
  type AddonRule,
  type PackagePricing,
  type PackageRule,
} from '@/lib/booking/price'
import type { SeasonalPrice } from '@/lib/booking/seasonal'
import {
  checkAvailability,
  isDayUnavailable,
  type AvailabilityRules,
} from '@/lib/availability/rules'

import { bookActivityAction, loadBookingFactsAction, loadTripBookingAction } from './actions'
import { alertPrefillAction, subscribeAlertAction } from './alert-actions'
import type { BookingFacts, BookingField } from './booking-contract'

// ---------------------------------------------------------------------------
// Data handed over by the server (already localized)
// ---------------------------------------------------------------------------

export type BookingIncluded = {
  id: string
  name: string
  href: string
  duration: string | null
  timeSlots: string[]
  timing: 'same_slot' | 'own_slot'
}

export type BookingPackage = {
  id: string
  name: string
  tagline: string | null
  priceMinor: number
  pricing: PackagePricing
  groupMax: number | null
  maxGuests: number | null
  minGuests: number | null
  includes: string[]
  excludes: string[]
  includesAddons: string[]
  available: boolean
  popular: boolean
  features: string[]
  highlights: string[]
  details: string[]
  notes: string[]
  /** Other activities this package includes (same date). */
  includedActivities: BookingIncluded[]
  /** Price per child (per-person packages); null = children pay the adult price. */
  childPriceMinor: number | null
  /** Seasonal prices; the travel date picks one. */
  seasons: SeasonalPrice[]
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
  /** Always added and charged. */
  required: boolean
  /** Library add-ons: picture and unit line for the add-on card. */
  imageUrl: string | null
  unitLabel: string | null
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
  /** Smallest party for the activity (a package may ask for more). */
  minGuests: number
  /** False for an `unavailable` activity: the box becomes a contact panel. */
  bookable: boolean
  /** Activity name, for the WhatsApp message of an unavailable activity. */
  name: string
  packages: BookingPackage[]
  addons: BookingAddon[]
  vehicles: BookingVehicle[]
  /** Activity-level facts the package panel and the four boxes show. */
  info: BookingInfo
  /** Child age band (e.g. 4–11); younger = infant, free. Null = no child pricing. */
  childAges: { min: number; max: number } | null
}

export type BookingInfo = {
  instantConfirmation: boolean
  freeCancellationHours: number | null
  place: string | null
  duration: string | null
  /** Activity-level lists, used when no package is chosen or it has none. */
  included: string[]
  excluded: string[]
  suitableFor: string[]
  importantNotes: string[]
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
  /** Of `people`: children and infants (child-priced packages only). */
  children: number
  infants: number
  /** Selected add-ons → quantity (1 unless per_qty). */
  addons: Record<string, number>
  /** Included activity (own slot) → time picked. */
  included: Record<string, string>
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
  /** Smallest party for the chosen package. */
  min: number
  driverAvailable: boolean
  /** Adults / children / infants steppers are shown (child price on the chosen package). */
  childMode: boolean
  setParty: (adults: number, children: number, infants: number) => void
  /** Closed dates and places (phase 2); null = unlimited / not loaded. */
  rules: AvailabilityRules | null
  /** How the booking will be confirmed; null = no supplier terms set up. */
  promise: ConfirmPromise | null
  setPackage: (id: string, el?: HTMLElement | null) => void
  setDate: (value: string) => void
  setRange: (value: CalendarRange) => void
  setTime: (value: string) => void
  setPeople: (value: number) => void
  setIncludedTime: (activityId: string, time: string) => void
  toggleAddon: (id: string, on: boolean) => void
  setAddonQty: (id: string, qty: number) => void
  setDriver: (on: boolean) => void
  submit: (mode: 'trip' | 'book') => void
  confirmDriver: (withDriver: boolean) => void
  modalOpen: boolean
  closeModal: () => void
  /** Editing a My Trip line (`?edit=<itemId>`): saving replaces it. */
  editing: boolean
  money: (minor: number) => string
}

/** "Instant" or "the supplier confirms within N hours". */
type ConfirmPromise = { instant: true } | { instant: false; hours: number }

/**
 * The confirmation the customer is promised, from the supplier offers' terms
 * (same rules as the server's `confirmationPromise`, using its ranking).
 */
function promiseFor(
  facts: BookingFacts | null,
  pkg: string | null,
  date: string | null,
  time: string | null,
): ConfirmPromise | null {
  if (!facts || facts.offers.length === 0) return null
  const fit = facts.offers
    .filter((offer) => offer.tierId === null || offer.tierId === pkg)
    .filter((offer) => !time || offer.timeSlots.length === 0 || offer.timeSlots.includes(time))
    .filter(
      (offer) =>
        !date ||
        offer.leadTimeHours === null ||
        offer.leadTimeHours <= 0 ||
        isWithinLeadTime(date, time ?? '00:00', offer.leadTimeHours),
    )
    .sort((a, b) => a.rank - b.rank)
  const chosen = fit[0]
  if (!chosen) {
    return { instant: false, hours: Math.max(1, ...facts.offers.map((o) => o.confirmWithinHours)) }
  }
  return chosen.instant ? { instant: true } : { instant: false, hours: chosen.confirmWithinHours }
}

const BookingContext = createContext<Ctx | null>(null)

export function useBooking(): Ctx {
  const ctx = useContext(BookingContext)
  if (!ctx) throw new Error('useBooking outside <BookingProvider>')
  return ctx
}

const STEP_ID: Record<BookingField, string> = {
  package: 'bk-s-pkg',
  date: 'bk-s-date',
  time: 'bk-s-time',
  included: 'bk-s-inc',
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
    childPriceMinor: pkg.childPriceMinor,
    seasons: pkg.seasons,
  }
}

/** Adults / children / infants are asked for: a child price on the package (on that date). */
function childModeFor(state: Pick<State, 'pkg' | 'date'>, data: BookingData): boolean {
  if (data.childAges === null) return false
  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  if (!pkgInfo) return false
  return hasChildPricing(toRule(pkgInfo, data), state.date)
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
    required: a.required,
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
  const cap = Math.max(1, Math.min(pkg?.maxGuests ?? data.maxGuests, data.maxGuests))
  // A couples package sells whole couples.
  return pkg?.pricing === 'per_couple' ? Math.max(2, cap - (cap % 2)) : cap
}

function minFor(pkg: BookingPackage | null, data: BookingData): number {
  const min = Math.max(1, pkg?.minGuests ?? data.minGuests)
  return pkg?.pricing === 'per_couple' ? Math.max(2, min + (min % 2)) : min
}

/** People within the package's bounds (and even for a couples package). */
function clampPeople(people: number, pkg: BookingPackage | null, data: BookingData): number {
  const cap = capFor(pkg, data)
  const min = Math.min(minFor(pkg, data), cap)
  let next = Math.min(cap, Math.max(min, Math.round(people)))
  if (pkg?.pricing === 'per_couple' && next % 2 === 1) next = next + 1 > cap ? next - 1 : next + 1
  return Math.max(1, next)
}

/** Own-slot included activities of a package that need a time picked. */
function ownSlotIncluded(pkg: BookingPackage | null): BookingIncluded[] {
  return (pkg?.includedActivities ?? []).filter(
    (a) => a.timing === 'own_slot' && a.timeSlots.length > 0,
  )
}

function priceOf(state: State, data: BookingData) {
  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  const days = state.date ? driverDays(data.multiDay, state.date, state.endDate) : 1
  return priceBooking({
    pkg: toRule(pkgInfo, data),
    addons: addonRules(data),
    picks: Object.entries(state.addons).map(([id, qty]) => ({ id, qty })),
    people: Math.max(1, state.people),
    travelDate: state.date,
    children: state.children,
    infants: state.infants,
    included: (pkgInfo?.includedActivities ?? []).map((a) => ({
      activityId: a.id,
      time: a.timing === 'own_slot' ? (state.included[a.id] ?? null) : null,
    })),
    driver: state.driver ? { vehicles: data.vehicles, days } : null,
  })
}

export function BookingProvider({ data, children }: { data: BookingData; children: ReactNode }) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()
  const { toast } = useToast()

  const firstPkg =
    data.packages.find((p) => p.available && p.popular) ??
    data.packages.find((p) => p.available) ??
    null
  const [state, setState] = useState<State>(() => ({
    pkg: firstPkg?.id ?? null,
    date: null,
    endDate: null,
    time: data.timeSlots.length === 1 ? (data.timeSlots[0] ?? null) : null,
    people: clampPeople(2, firstPkg, data),
    children: 0,
    infants: 0,
    addons: {},
    included: {},
    driver: false,
  }))
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [bump, setBump] = useState(0)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [today] = useState(() => todayInBali())
  const [facts, setFacts] = useState<BookingFacts | null>(null)

  // Places and confirmation terms are read live, never from the cached page.
  useEffect(() => {
    let alive = true
    loadBookingFactsAction(data.activityId)
      .then((loaded) => {
        if (alive) setFacts(loaded)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [data.activityId])

  // "Edit" on My Trip opens this page with `?edit=<itemId>`: load that line
  // (the server checks it is the caller's own) back into the box.
  useEffect(() => {
    const itemId = new URLSearchParams(window.location.search).get('edit')
    if (!itemId) return
    let alive = true
    loadTripBookingAction(itemId)
      .then((booking) => {
        if (!alive || booking === null || booking.activityId !== data.activityId) return
        const loaded: State = {
          pkg: booking.packageId,
          date: booking.date,
          endDate: data.multiDay ? booking.endDate : null,
          time: booking.time,
          people: booking.people,
          children: booking.children,
          infants: booking.infants,
          addons: Object.fromEntries(booking.addons.map((a) => [a.id, a.qty])),
          included: Object.fromEntries(
            booking.included.flatMap((a): [string, string][] =>
              a.time ? [[a.activityId, a.time]] : [],
            ),
          ),
          driver: booking.driver,
        }
        setState(prune(loaded, data))
        setEditing(booking.itemId)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [data])

  // Phase 3: an itinerary's "book this day" link opens the box with the date
  // of that day of the trip (`?date=YYYY-MM-DD`). Ignored when malformed or
  // already past; everything else is still picked here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('edit')) return
    const date = params.get('date')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayInBali()) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after mount
    setState((current) => ({ ...current, date }))
  }, [])

  const pkgInfo = data.packages.find((p) => p.id === state.pkg) ?? null
  const pkg = toRule(pkgInfo, data)
  const cap = capFor(pkgInfo, data)
  const min = Math.min(minFor(pkgInfo, data), cap)
  const price = useMemo(() => priceOf(state, data), [state, data])
  const vehicle = data.vehicles.find(
    (v) => v.vehicleClass === price.vehicleClass && v.currency === data.currency,
  )
  // No driver step or suggestion while the service is off (lib/features.ts).
  const driverAvailable = FEATURES.driver && vehicle !== undefined
  const childMode = childModeFor(state, data)
  const rules: AvailabilityRules | null = facts?.availability ?? null
  const promise = promiseFor(facts, state.pkg, state.date, state.time)

  const money = (minor: number) => formatPrice(minor, data.currency, locale)

  /** Every change goes through here: prune add-ons, clamp people, bump the total. */
  function update(patch: Partial<State>, clear?: BookingField) {
    let next = prune({ ...state, ...patch }, data)
    const nextPkg = data.packages.find((p) => p.id === next.pkg) ?? null
    const people = clampPeople(next.people, nextPkg, data)
    if (people !== next.people) next = { ...next, people }
    // Children and infants only on a child-priced package, and always ≥ 1 adult.
    if (!childModeFor(next, data)) {
      if (next.children !== 0 || next.infants !== 0) next = { ...next, children: 0, infants: 0 }
    } else {
      const children = Math.min(next.children, next.people - 1)
      const infants = Math.min(next.infants, next.people - 1 - children)
      if (children !== next.children || infants !== next.infants) {
        next = { ...next, children, infants }
      }
    }
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
    if (ownSlotIncluded(pkgInfo).some((a) => !state.included[a.id])) {
      next.included = t('act_err_included')
    }
    if (!(state.people > 0)) next.people = t('act_err_people')
    if (rules && state.date && !next.date && !next.time) {
      const verdict = checkAvailability(rules, state.date, state.time, state.people)
      if (!verdict.ok) {
        const message =
          verdict.reason === 'closed'
            ? t('act_err_closed')
            : verdict.remaining > 0
              ? t('act_err_places_left', { n: verdict.remaining })
              : t('act_err_sold_out')
        if (data.timeSlots.length > 0 && verdict.reason === 'full') next.time = message
        else next.date = message
      }
    }
    return next
  }

  function showErrors(next: Errors) {
    setErrors(next)
    const first = (
      ['package', 'date', 'time', 'included', 'people', 'addons', 'driver', 'form'] as const
    ).find((field) => next[field])
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
    guests_below_min: 'act_err_people_min',
    included_missing_time: 'act_err_included',
    included_invalid_time: 'act_err_included',
    invalid_quantity: 'act_err_people',
    invalid_addon: 'act_err_addon',
    package_unavailable: 'act_err_package',
    unknown_item: 'act_err_package',
    driver_full: 'act_err_driver_full',
    closed: 'bk_closed_t',
    date_closed: 'act_err_closed',
    sold_out: 'act_err_sold_out',
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
        children: state.children,
        infants: state.infants,
        addons: Object.entries(state.addons).map(([id, qty]) => ({ id, qty })),
        included: ownSlotIncluded(pkgInfo).map((a) => ({
          activityId: a.id,
          time: state.included[a.id] ?? null,
        })),
        driver: withDriver,
        replaceItemId: editing,
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
      if (editing !== null) {
        setEditing(null)
        toast(t('trip_updated'))
        router.push(CART_HREF)
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
    min,
    driverAvailable,
    childMode,
    rules,
    promise,
    setParty: (adults, children, infants) =>
      update(
        {
          people: Math.max(1, adults) + Math.max(0, children) + Math.max(0, infants),
          children: Math.max(0, children),
          infants: Math.max(0, infants),
        },
        'people',
      ),
    money,
    modalOpen,
    closeModal: () => setModalOpen(false),
    editing: editing !== null,
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
    setIncludedTime: (activityId, time) =>
      update({ included: { ...state.included, [activityId]: time } }, 'included'),
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
  if (pkg.pricing === 'per_couple') return t('act_per_couple')
  return pkg.pricing === 'per_group'
    ? pkg.groupMax
      ? t('act_per_group_max', { n: pkg.groupMax })
      : t('act_per_group')
    : t('act_per_person')
}

/**
 * The party-size stepper: people, or couples for a couples package (the
 * state always holds people; a couple is two).
 */
export function PartyStepper({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const t = useTranslations()
  const { state, data, pkgInfo, cap, min, setPeople, childMode, setParty } = useBooking()
  if (childMode) {
    // Adults here; children and infants have their own steppers in the box.
    const kids = state.children + state.infants
    return (
      <Stepper
        size={size}
        value={state.people - kids}
        onChange={(value) => setParty(value, state.children, state.infants)}
        min={Math.max(1, min - kids)}
        max={Math.max(1, cap - kids)}
        label={adultsLabel(t, data.childAges)}
        decreaseLabel={t('c_qty_dec')}
        increaseLabel={t('c_qty_inc')}
      />
    )
  }
  const couples = pkgInfo?.pricing === 'per_couple'
  const label = couples ? t('act_qty_couples') : t('act_qty_people')
  return (
    <Stepper
      size={size}
      value={couples ? Math.max(1, Math.round(state.people / 2)) : state.people}
      onChange={(value) => setPeople(couples ? value * 2 : value)}
      min={couples ? Math.max(1, Math.round(min / 2)) : min}
      max={couples ? Math.max(1, Math.floor(cap / 2)) : cap}
      label={label}
      decreaseLabel={t('c_qty_dec')}
      increaseLabel={t('c_qty_inc')}
    />
  )
}

/** "Adults (12+)": the age after the child band. */
function adultsLabel(
  t: ReturnType<typeof useTranslations>,
  ages: { min: number; max: number } | null,
): string {
  return ages ? t('act_s_adults_from', { min: ages.max + 1 }) : t('act_s_adults')
}

/** Children and infants steppers (child-priced packages). */
function ChildSteppers() {
  const t = useTranslations()
  const { state, cap, data, pkgInfo, setParty, money } = useBooking()
  const ages = data.childAges
  if (!ages) return null
  const adults = state.people - state.children - state.infants
  const room = Math.max(0, cap - state.people)
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <small>
          <b>{t('act_s_children', { min: ages.min, max: ages.max })}</b>
          {pkgInfo?.childPriceMinor !== null && pkgInfo?.childPriceMinor !== undefined ? (
            <>
              <br />
              <span className="muted" dir="ltr">
                {money(pkgInfo.childPriceMinor)}
              </span>
            </>
          ) : null}
        </small>
        <Stepper
          size="sm"
          value={state.children}
          onChange={(value) => setParty(adults, value, state.infants)}
          min={0}
          max={state.children + room}
          label={t('act_s_children', { min: ages.min, max: ages.max })}
          decreaseLabel={t('c_qty_dec')}
          increaseLabel={t('c_qty_inc')}
        />
      </div>
      {ages.min > 0 ? (
        <div className="row between" style={{ flexWrap: 'nowrap' }}>
          <small>
            <b>{t('act_s_infants', { min: ages.min })}</b>
            <br />
            <span className="muted">{t('act_infants_free')}</span>
          </small>
          <Stepper
            size="sm"
            value={state.infants}
            onChange={(value) => setParty(adults, state.children, value)}
            min={0}
            max={state.infants + room}
            label={t('act_s_infants', { min: ages.min })}
            decreaseLabel={t('c_qty_dec')}
            increaseLabel={t('c_qty_inc')}
          />
        </div>
      ) : null}
    </div>
  )
}

/** Short list on a package card: its inclusions and feature chips. */
function cardChecks(p: BookingPackage): string[] {
  return [...new Set([...p.includes, ...p.features])]
}

export function PackageCards() {
  const t = useTranslations()
  const { data, state, setPackage, money } = useBooking()
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [compare, setCompare] = useState(false)

  const features = [...new Set(data.packages.flatMap((p) => [...p.includes, ...p.excludes]))]

  return (
    <>
      <div className="row between">
        <h2>{t('act_choose_t')}</h2>
        {data.packages.length > 1 && features.length > 0 ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            aria-expanded={compare}
            aria-controls="act-cmp"
            onClick={() => setCompare((value) => !value)}
          >
            <Icon name="list" size={16} /> {t('act_pkgs_compare')}
          </button>
        ) : null}
      </div>
      <div className="tcards" role="list" aria-label={t('act_pkgs_label')}>
        {data.packages.map((p) => {
          const on = state.pkg === p.id
          const checks = cardChecks(p)
          const extra =
            checks.length > TIER_CHECKS ||
            p.excludes.length + p.highlights.length + p.details.length + p.notes.length > 0 ||
            p.includedActivities.length > 0
          const expanded = open[p.id] === true
          const panelId = `tier-more-${p.id}`
          return (
            <article
              key={p.id}
              role="listitem"
              className={`tcard${on ? ' on' : ''}${p.available ? '' : ' off'}`}
              aria-label={p.name}
            >
              {p.popular ? <span className="badge-top">{t('act_pkg_popular')}</span> : null}
              <h3 className="tname">{p.name}</h3>
              <p className="tprice">
                <b className="price" dir="ltr">
                  {money(p.priceMinor)}
                </b>{' '}
                <small>{perLabel(t, p)}</small>
              </p>
              {p.tagline ? <p className="muted ttag">{p.tagline}</p> : null}
              {checks.length > 0 ? (
                <ul className="tchecks">
                  {checks.slice(0, TIER_CHECKS).map((line) => (
                    <li key={line}>
                      <Icon name="check" size={15} stroke={2.4} />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {extra ? (
                <button
                  type="button"
                  className="link tmore"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen((value) => ({ ...value, [p.id]: !expanded }))}
                >
                  {expanded ? t('act_less_features') : t('act_all_features')}
                </button>
              ) : null}
              {expanded ? (
                <div id={panelId} className="tall">
                  <TierLists p={p} />
                </div>
              ) : null}
              <div className="tfoot">
                {on ? <PartyStepper size="sm" /> : null}
                <button
                  type="button"
                  className={on ? 'btn btn-forest btn-sm' : 'btn btn-primary btn-sm'}
                  aria-pressed={on}
                  disabled={!p.available}
                  onClick={(event) => setPackage(p.id, event.currentTarget.closest('article'))}
                >
                  {on ? (
                    <>
                      <Icon name="check" size={15} stroke={2.6} /> {t('act_chosen_pkg')}
                    </>
                  ) : (
                    t('act_choose_pkg')
                  )}
                </button>
              </div>
              {!p.available ? <span className="why">{t('act_pkg_unavailable')}</span> : null}
            </article>
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
                      {p.pricing === 'per_group'
                        ? t('act_cmp_group')
                        : p.pricing === 'per_couple'
                          ? t('act_cmp_couple')
                          : t('act_cmp_person')}
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

/** Cards show this many ticks before "see all features". */
const TIER_CHECKS = 4

/** Every list a package carries, for its expanded card. */
function TierLists({ p }: { p: BookingPackage }) {
  const t = useTranslations()
  const lists: { key: string; title: string; items: string[]; no?: boolean }[] = [
    { key: 'inc', title: t('act_box_inc'), items: cardChecks(p) },
    { key: 'exc', title: t('act_box_exc'), items: p.excludes, no: true },
    { key: 'hl', title: t('act_highlights_t'), items: p.highlights },
    { key: 'dt', title: t('act_sec_details'), items: p.details },
    { key: 'nt', title: t('act_box_notes'), items: p.notes },
  ]
  return (
    <>
      {lists
        .filter((list) => list.items.length > 0)
        .map((list) => (
          <div key={list.key} className="tlist">
            <b>{list.title}</b>
            <ul className="tchecks">
              {list.items.map((line) => (
                <li key={line} className={list.no ? 'no' : undefined}>
                  <Icon name={list.no ? 'cross' : 'check'} size={15} stroke={2.4} />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      {p.includedActivities.length > 0 ? (
        <div className="tlist">
          <b>{t('act_detail_included_acts')}</b>
          <IncludedList items={p.includedActivities} />
        </div>
      ) : null}
    </>
  )
}

function IncludedList({ items }: { items: BookingIncluded[] }) {
  const t = useTranslations()
  return (
    <ul className="tincl">
      {items.map((a) => (
        <li key={a.id}>
          <Icon name="ticket" size={16} />
          <span>
            <Link href={a.href} className="link">
              {a.name}
            </Link>
            <small className="muted">
              {a.timing === 'own_slot' && a.timeSlots.length > 0
                ? t('act_inc_own_time')
                : t('act_inc_same_time')}
              {a.duration ? ` · ${a.duration}` : ''}
            </small>
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * The chosen package in detail (or the activity itself when it has none):
 * the confirmation and cancellation promises, schedule, place, duration,
 * party size, what else it includes, and "Book now".
 */
export function TierDetail({ schedule }: { schedule: string | null }) {
  const t = useTranslations()
  const { data, pkgInfo, price, money, cap, min, promise } = useBooking()
  const info = data.info
  const facts: { icon: IconName; text: string; ltr?: boolean; ok?: boolean }[] = []
  // Supplier terms, when set up, decide the promise; otherwise the page flag.
  if (promise !== null) {
    facts.push(
      promise.instant
        ? { icon: 'bolt', text: t('act_detail_instant'), ok: true }
        : { icon: 'clock', text: t('act_confirm_hours', { n: promise.hours }) },
    )
  } else if (info.instantConfirmation)
    facts.push({ icon: 'bolt', text: t('act_detail_instant'), ok: true })
  if (info.freeCancellationHours !== null) {
    facts.push({
      icon: 'shield',
      text: t('act_detail_free_cancel', { n: info.freeCancellationHours }),
      ok: true,
    })
  }
  if (schedule) facts.push({ icon: 'cal', text: schedule, ltr: /^[\d:·\s]+$/.test(schedule) })
  if (info.place) facts.push({ icon: 'pin', text: info.place })
  if (info.duration) facts.push({ icon: 'clock', text: info.duration })
  if (showsGroupSize(cap, min)) {
    facts.push({
      icon: 'users',
      text: min > 1 ? t('act_qf_group_v', { min, max: cap }) : t('act_qf_group_upto', { max: cap }),
    })
  }
  return (
    <section className="tdetail panel" aria-labelledby="tdetail-h">
      <div className="tdetail-head">
        <div className="stack" style={{ gap: 2 }}>
          {pkgInfo?.popular ? <span className="tag tag-sun">{t('act_pkg_popular')}</span> : null}
          <h3 id="tdetail-h" className="h3">
            {pkgInfo?.name ?? t('act_base_line')}
          </h3>
          {pkgInfo?.tagline ? <p className="muted">{pkgInfo.tagline}</p> : null}
        </div>
        <p className="tprice">
          <b className="price" dir="ltr">
            {money(pkgInfo?.priceMinor ?? data.basePriceMinor)}
          </b>{' '}
          <small>{pkgInfo ? perLabel(t, pkgInfo) : t('act_per_person')}</small>
        </p>
      </div>
      <ul className="tfacts">
        {facts.map((fact) => (
          <li key={fact.text} className={fact.ok ? 'ok' : undefined}>
            <Icon name={fact.icon} size={17} />
            <span dir={fact.ltr ? 'ltr' : undefined}>{fact.text}</span>
          </li>
        ))}
      </ul>
      {pkgInfo && pkgInfo.includedActivities.length > 0 ? (
        <div className="tlist">
          <b>{t('act_detail_included_acts')}</b>
          <IncludedList items={pkgInfo.includedActivities} />
        </div>
      ) : null}
      {data.bookable ? (
        <div className="row between tdetail-foot">
          <span className="muted">
            {t('act_sum_total')}{' '}
            <b className="price" dir="ltr">
              {money(price.totalMinor)}
            </b>
          </span>
          <a
            className="btn btn-primary"
            href="#book"
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
      ) : null}
    </section>
  )
}

/** تشمل الباقة / لا تشمل الباقة / مناسبة لـ / ملاحظات مهمة — for the chosen package. */
export function InfoBoxes() {
  const t = useTranslations()
  const { data, pkgInfo } = useBooking()
  const info = data.info
  const includes = pkgInfo && cardChecks(pkgInfo).length > 0 ? cardChecks(pkgInfo) : info.included
  const excludes = pkgInfo && pkgInfo.excludes.length > 0 ? pkgInfo.excludes : info.excluded
  const notes = [...new Set([...(pkgInfo?.notes ?? []), ...info.importantNotes])]
  const boxes: { key: string; title: string; items: string[]; icon: IconName; tone: string }[] = [
    { key: 'inc', title: t('act_box_inc'), items: includes, icon: 'check', tone: 'ok' },
    { key: 'exc', title: t('act_box_exc'), items: excludes, icon: 'cross', tone: 'no' },
    {
      key: 'suit',
      title: t('act_box_suits'),
      items: info.suitableFor,
      icon: 'users',
      tone: 'info',
    },
    { key: 'notes', title: t('act_box_notes'), items: notes, icon: 'info', tone: 'warn' },
  ]
  const shown = boxes.filter((box) => box.items.length > 0)
  if (shown.length === 0) return null
  return (
    <div className="iboxes">
      {shown.map((box) => (
        <div key={box.key} className={`panel ibox ibox-${box.tone}`}>
          <b className="ibox-h">
            <Icon name={box.icon} size={18} stroke={2.2} /> {box.title}
          </b>
          <ul>
            {box.items.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** Optional extras as cards with a + button; the same picks as the booking box. */
export function AddonStrip() {
  const t = useTranslations()
  const b = useBooking()
  const { data, state, money } = b
  if (data.addons.length === 0 || !data.bookable) return null
  const selected = new Set(Object.keys(state.addons))
  return (
    <div className="astrip" role="list">
      {data.addons.map((a) => {
        const rule = addonRules({ ...data, addons: [a] })[0]
        const st = rule ? addonState(rule, b.pkg, selected) : { kind: 'unavailable' as const }
        const included = st.kind === 'included'
        const required = st.kind === 'required'
        const on = included || required || state.addons[a.id] !== undefined
        const locked = st.kind !== 'selectable'
        return (
          <article key={a.id} role="listitem" className={`acard${on ? ' on' : ''}`}>
            {a.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- CMS media, already-sized derivative
              <img src={a.imageUrl} alt="" loading="lazy" decoding="async" />
            ) : (
              <span className="acard-ph" aria-hidden="true">
                <Icon name="sparkle" size={22} />
              </span>
            )}
            <span className="acard-txt">
              <b>{a.name}</b>
              {a.description ? <small className="muted">{a.description}</small> : null}
              <span className="acard-price">
                <span className="price" dir="ltr">
                  {included ? t('act_included') : money(a.priceMinor)}
                </span>{' '}
                <small className="muted">{a.unitLabel ?? perAddon(t, a)}</small>
              </span>
              {required ? <small className="why">{t('act_addon_required')}</small> : null}
            </span>
            <button
              type="button"
              className={on ? 'icon-btn acard-btn on' : 'icon-btn acard-btn'}
              aria-pressed={on}
              aria-label={
                on ? t('act_addon_remove', { name: a.name }) : t('act_addon_add', { name: a.name })
              }
              disabled={locked}
              onClick={() => b.toggleAddon(a.id, !on)}
            >
              <Icon name={on ? 'check' : 'plus'} size={18} stroke={2.4} />
            </button>
          </article>
        )
      })}
    </div>
  )
}

function perAddon(t: ReturnType<typeof useTranslations>, a: BookingAddon): string {
  return a.pricing === 'per_person'
    ? t('act_addon_pp')
    : a.pricing === 'per_qty'
      ? t('act_addon_unit')
      : t('act_addon_booking')
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
  const { data, state, errors, price, money, pkgInfo } = b

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

  const rules = b.rules
  const slotOpen = (slot: string) =>
    !state.date || isWithinLeadTime(state.date, slot, data.leadTimeHours)
  /** Places for this departure on the chosen date (phase 2). */
  const slotPlaces = (slot: string) =>
    rules && state.date ? checkAvailability(rules, state.date, slot, state.people) : null
  const dayUnavailable = (day: string) =>
    (data.timeSlots.length > 0
      ? data.timeSlots.every((slot) => !isWithinLeadTime(day, slot, data.leadTimeHours))
      : !isWithinLeadTime(day, '00:00', data.leadTimeHours)) ||
    (rules !== null && isDayUnavailable(rules, day, data.timeSlots))

  const vehicle = data.vehicles.find(
    (v) => v.vehicleClass === price.vehicleClass && v.currency === data.currency,
  )
  const days = state.date ? driverDays(data.multiDay, state.date, state.endDate) : 1

  let n = 0
  const step = () => ++n
  const hasPackages = data.packages.length > 0

  const addonById = new Map(data.addons.map((a) => [a.id, a]))
  const includedById = new Map((pkgInfo?.includedActivities ?? []).map((a) => [a.id, a]))
  const lineLabel = (line: (typeof price.lines)[number]) => {
    if (line.kind === 'package') {
      const name = pkgInfo?.name ?? t('act_base_line')
      return pkgInfo?.pricing === 'per_group'
        ? t('act_line_groups', { name, n: line.quantity })
        : pkgInfo?.pricing === 'per_couple'
          ? t('act_line_couples', { name, n: line.quantity })
          : t('act_line_people', { name, n: line.quantity })
    }
    if (line.kind === 'child') {
      return t('act_line_children', { name: pkgInfo?.name ?? t('act_base_line'), n: line.quantity })
    }
    if (line.kind === 'included') {
      const name = (line.refId ? includedById.get(line.refId)?.name : undefined) ?? ''
      return `${t('act_line_included', { name })}${line.time ? ` · ${line.time}` : ''}`
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
  const ownSlots = ownSlotIncluded(pkgInfo)

  if (!data.bookable) return <UnavailableBox />

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
                const places = slotPlaces(slot)
                const shut = places !== null && !places.ok && places.remaining <= 0
                return (
                  <button
                    key={slot}
                    type="button"
                    className="slot"
                    dir="ltr"
                    aria-pressed={state.time === slot}
                    disabled={!open || shut}
                    onClick={() => b.setTime(slot)}
                  >
                    {slot}
                    {!open ? (
                      <small>{t('act_slot_closed')}</small>
                    ) : shut ? (
                      <small>{t('act_slot_full')}</small>
                    ) : places !== null && places.remaining !== null && places.remaining <= 5 ? (
                      <small>{t('act_places_left', { n: places.remaining })}</small>
                    ) : null}
                  </button>
                )
              })}
            </div>
            <StepError id={`${uid}-time-err`} message={errors.time} />
          </div>
        ) : null}

        {ownSlots.length > 0 ? (
          <div
            className={`bstep${ownSlots.every((a) => state.included[a.id]) ? ' ok' : ''}${errors.included ? ' has-error' : ''}`}
            id={STEP_ID.included}
          >
            <span className="lbl">
              <span className="n">{step()}</span>
              {t('act_s_included')}
            </span>
            {ownSlots.map((a) => (
              <div key={a.id} className="stack" style={{ gap: 6 }}>
                <small id={`${uid}-inc-${a.id}`}>
                  <b>{a.name}</b>
                </small>
                <div className="slots" role="group" aria-labelledby={`${uid}-inc-${a.id}`}>
                  {a.timeSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className="slot"
                      dir="ltr"
                      aria-pressed={state.included[a.id] === slot}
                      onClick={() => b.setIncludedTime(a.id, slot)}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <StepError id={`${uid}-inc-err`} message={errors.included} />
          </div>
        ) : null}

        <div
          className={`bstep${state.people > 0 ? ' ok' : ''}${errors.people ? ' has-error' : ''}`}
          id={STEP_ID.people}
        >
          <span className="lbl">
            <span className="n">{step()}</span>
            {pkgInfo?.pricing === 'per_couple' ? t('act_qty_couples') : t('act_s_people')}
          </span>
          {b.childMode ? (
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <small>
                <b>{adultsLabel(t, b.data.childAges)}</b>
              </small>
              <PartyStepper size="sm" />
            </div>
          ) : null}
          {b.childMode ? <ChildSteppers /> : null}
          <div className="row between" style={{ flexWrap: 'nowrap' }}>
            {b.childMode ? null : <PartyStepper />}
            <small className="muted">
              {pkgInfo?.pricing === 'per_group'
                ? t('act_ppl_note_group', { n: pkgInfo.groupMax ?? b.cap })
                : pkgInfo?.pricing === 'per_couple'
                  ? t('act_ppl_note_couple', { price: money(pkgInfo.priceMinor) })
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
                const checked =
                  included || st.kind === 'required' || state.addons[a.id] !== undefined
                const why =
                  st.kind === 'required'
                    ? t('act_addon_required')
                    : st.kind === 'included'
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
                      <small className="muted">{a.unitLabel ?? perAddon(t, a)}</small>
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
            <span>{data.timeSlots.length > 0 ? t('act_sum_when') : t('act_sum_date')}</span>
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
          {price.seasonLabel ? (
            <small className="muted">{t('act_season_price', { label: price.seasonLabel })}</small>
          ) : null}
          {b.promise !== null ? (
            <small className={b.promise.instant ? 'bk-confirm ok' : 'bk-confirm'}>
              <Icon name={b.promise.instant ? 'bolt' : 'clock'} size={15} />{' '}
              {b.promise.instant
                ? t('act_confirm_instant')
                : t('act_confirm_hours', { n: b.promise.hours })}
            </small>
          ) : null}
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
            <Icon name={b.editing ? 'check' : 'suitcase'} size={18} />{' '}
            {b.editing ? t('trip_save_changes') : t('act_add_trip')}
          </button>
          {b.editing && <small className="muted center">{t('trip_editing_note')}</small>}
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
  const { price, money, data } = useBooking()
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

  if (!data.bookable) return null

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

// ---------------------------------------------------------------------------
// Unavailable activity: a contact panel instead of the booking form
// ---------------------------------------------------------------------------

function UnavailableBox() {
  const t = useTranslations()
  const locale = useLocale()
  const { data } = useBooking()
  const wa = whatsappLink(t('act_unavailable_wa_msg', { name: data.name }))
  const uid = useId()
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Signed-in visitors: their own email / phone, filled in (the page is cached).
  useEffect(() => {
    let alive = true
    alertPrefillAction()
      .then((prefill) => {
        if (!alive) return
        setEmail((value) => value || prefill.email)
        setPhone((value) => value || prefill.phone)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await subscribeAlertAction({
        activityId: data.activityId,
        email,
        phone,
        locale,
      })
      if (result.ok) setDone(true)
      else setError(t(`act_alert_err_${result.error}`))
    } catch {
      setError(t('act_alert_err_failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel bk bk-off" id="bk-form">
      <div className="bk-body">
        <span className="bk-off-ill" aria-hidden="true">
          <Icon name="info" size={26} />
        </span>
        <h2 className="h3">{t('act_unavailable_t')}</h2>
        <p className="muted">{t('act_unavailable_b')}</p>
        {done ? (
          <p className="bk-alert-ok" role="status">
            <Icon name="check" size={18} /> {t('act_alert_ok')}
          </p>
        ) : (
          <form className="stack bk-alert" style={{ gap: 10 }} onSubmit={submit} noValidate>
            <h3 className="h4" style={{ margin: 0 }}>
              <Icon name="bell" size={18} /> {t('act_alert_t')}
            </h3>
            <small className="muted">{t('act_alert_b')}</small>
            <div className="bt-field" style={{ marginBottom: 0 }}>
              <label className="bt-flabel" htmlFor={`${uid}-email`}>
                {t('act_alert_email')}
              </label>
              <input
                id={`${uid}-email`}
                className="bt-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="bt-field" style={{ marginBottom: 0 }}>
              <label className="bt-flabel" htmlFor={`${uid}-phone`}>
                {t('act_alert_phone')}
              </label>
              <input
                id={`${uid}-phone`}
                className="bt-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={24}
                placeholder="+62"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <small className="muted">{t('act_alert_consent')}</small>
            {error ? (
              <p className="bt-errmsg" role="alert" style={{ margin: 0 }}>
                {error}
              </p>
            ) : null}
            <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
              {t('act_alert_submit')}
            </button>
          </form>
        )}
        <small className="muted center">{t('act_alert_or_contact')}</small>
        <div className="stack" style={{ gap: 8 }}>
          {wa ? (
            <a
              className="btn btn-ghost btn-block"
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="whatsapp" size={18} /> {t('act_unavailable_wa')}
            </a>
          ) : null}
          <Link className="btn btn-ghost btn-block" href="/contact">
            <Icon name="mail" size={18} /> {t('act_unavailable_contact')}
          </Link>
          <small className="muted center" dir="ltr">
            {CONTACT_EMAIL}
          </small>
        </div>
      </div>
    </div>
  )
}
