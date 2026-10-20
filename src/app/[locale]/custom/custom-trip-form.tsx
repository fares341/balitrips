'use client'

/**
 * Custom-trip questionnaire and proposal.
 *
 * Ported from `CustomPage` in design/handoff/sections-bt/page-content.jsx: the
 * date range, traveller stepper, theme pills, three budget categories, interest
 * toggles, driver toggle and notes field — then the recommendations view with
 * its answer chips, activity grid and WhatsApp hand-off.
 *
 * What changed, beyond the three fixes that live in `actions.ts` and `match.ts`:
 *
 *  - **It is a real form.** The handoff's submit button was
 *    `onClick={() => setDone(true)}`; this posts to a server action through
 *    `useActionState`, so the questionnaire works with JavaScript still
 *    loading and the answers reach the database either way.
 *  - **Contact details are asked for first.** They are the reason the form
 *    exists.
 *  - **The WhatsApp number comes from the environment.** The prototype hard-
 *    coded `const WA_NUMBER = "9665481656544666"` — sixteen digits, which is
 *    longer than E.164 permits and is not a reachable number, so every
 *    "Finalize on WhatsApp" click in the prototype opened an error page. It is
 *    read from `NEXT_PUBLIC_WHATSAPP_NUMBER` and validated; when it is missing
 *    or malformed the button is withheld rather than shipped broken.
 *  - **The message body is localized.** The handoff sent an English template
 *    regardless of the language the visitor filled the form in.
 */

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'

import { ActivityCard } from '@/components/cards'
import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { Button, LinkButton, Stepper, Tag, useToast } from '@/components/shared'
import { Icon } from '@/components/ui'
import type { Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/routing'
import { BUDGET_TIER_LABEL, BUDGET_TIERS, type BudgetTier } from '@/lib/budget-tier'
import { FEATURES } from '@/lib/features'
import { todayInBali } from '@/lib/booking-rules'
import { Calendar } from '@/components/booking/calendar'

import { submitCustomTrip } from './actions'
import {
  AREAS_MAX,
  BUDGET_TIER_DEFAULT,
  FORM_THEMES,
  NAME_MAX,
  NOTES_MAX,
  PAX_DEFAULT,
  PAX_MAX,
  PAX_MIN,
  PHONE_MAX,
  THEMES,
  type AreaOption,
  type CustomTripState,
  type InterestOption,
  type ThemeKey,
} from './types'

/**
 * E.164 allows at most fifteen digits, and no real number has fewer than eight.
 * The handoff's placeholder had sixteen.
 */
const WA_MIN_DIGITS = 8
const WA_MAX_DIGITS = 15

/** Wizard steps, in order (titles). Must match the fieldsets below. */
const STEP_LABELS = [
  'cp4_s_dates',
  'cp4_s_travellers',
  'cp4_s_areas',
  'cp4_s_interests',
  'cp4_s_budget',
  'cp4_s_extras',
  'cp4_s_contact',
] as const

/** Which step holds a field the server rejected. */
const FIELD_STEP: Record<string, number> = {
  startDate: 0,
  endDate: 0,
  dates: 0,
  travellers: 1,
  areas: 2,
  theme: 3,
  interests: 3,
  budgetTier: 4,
  notes: 5,
}

function stepOfErrors(fields: readonly string[]): number {
  const steps = fields.map((field) => FIELD_STEP[field] ?? STEP_LABELS.length - 1)
  return steps.length === 0 ? STEP_LABELS.length - 1 : Math.min(...steps)
}

const subscribeNothing = () => () => {}

const INITIAL_STATE: CustomTripState = { status: 'idle' }

export type CustomTripFormProps = {
  /**
   * The interest toggles, already resolved against the `categories` table and
   * localized by the server. Never a hard-coded list — that is what put a
   * label-less chip on the prototype's screen.
   */
  interests: readonly InterestOption[]
  /** المناطق المفعّلة (الوثيقة 5.2: المناطق المفضلة)، مترجمة على الخادم. */
  areas: readonly AreaOption[]
  /** Which of them start selected. Server-chosen, so it is a real key. */
  defaultInterests: readonly string[]
}

/** One-line description under each budget category. */
const BUDGET_TIER_HINT: Record<BudgetTier, string> = {
  economy: 'bud_economy_b',
  mid: 'bud_mid_b',
  luxury: 'bud_luxury_b',
}

export function CustomTripForm({ interests, areas, defaultInterests }: CustomTripFormProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()
  const { toast } = useToast()

  const [state, action, pending] = useActionState(submitCustomTrip, INITIAL_STATE)

  const baseId = useId()

  // Controlled bits the design renders as custom controls; each one carries its
  // value into the payload through a hidden input.
  const [travellers, setTravellers] = useState(PAX_DEFAULT)
  const [theme, setTheme] = useState<ThemeKey>(THEMES[0].key)
  const [budgetTier, setBudgetTier] = useState<BudgetTier>(BUDGET_TIER_DEFAULT)
  const [selected, setSelected] = useState<string[]>(() =>
    interests.filter((one) => defaultInterests.includes(one.key)).map((one) => one.key),
  )
  const [wantsDriver, setWantsDriver] = useState(FEATURES.driver)
  const [pickedAreas, setPickedAreas] = useState<string[]>([])
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  /**
   * Which proposal the traveller has dismissed with "Start over".
   *
   * Comparing ids rather than flipping a boolean in an effect: a second
   * submission produces a new id, so the new proposal shows without anything
   * having to reset the flag.
   */
  const [dismissed, setDismissed] = useState<string | null>(null)

  const done = state.status === 'done' && state.requestId !== dismissed
  const errors = state.status === 'error' ? (state.fields ?? {}) : {}

  // ---- wizard (v3 custom-trip.html): one question group per step ----------
  // Before hydration (or without JavaScript) every step shows and the form
  // submits in one go; once hydrated it becomes the stepped panel.
  const wizard = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  )
  const formRef = useRef<HTMLFormElement>(null)

  // Phase 3, sale mode D: "make me something like this itinerary" opens the
  // form with `?from=<slug>&name=…&days=N`; the notes start with that request
  // (still editable) so the team knows what it is based on.
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const [basedOn, setBasedOn] = useState<string | null>(null)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const from = params.get('from')
    if (!from || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(from)) return
    const name = (params.get('name') ?? from).slice(0, 100)
    const days = Number(params.get('days') ?? '')
    const line =
      Number.isInteger(days) && days > 0 && days < 60
        ? t('p3_custom_prefill_days', { name, days })
        : t('p3_custom_prefill', { name })
    const box = notesRef.current
    if (box !== null && box.value.trim() === '') box.value = line
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the URL after mount
    setBasedOn(name)
  }, [t])
  const [chosenStep, setChosenStep] = useState(0)
  /** The server reply the traveller has already been taken to (see below). */
  const [seenReply, setSeenReply] = useState<unknown>(INITIAL_STATE)
  // A fresh error reply jumps to the first step with a problem in it.
  const errorStep =
    state.status === 'error' && state !== seenReply ? stepOfErrors(Object.keys(errors)) : null
  const step = errorStep ?? chosenStep
  const goTo = (index: number) => {
    setSeenReply(state)
    setChosenStep(Math.max(0, Math.min(STEP_LABELS.length - 1, index)))
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  const next = () => {
    // The browser's own checks on the fields of this step (required, email…).
    const fields = formRef.current?.querySelectorAll<HTMLInputElement>(
      `fieldset[data-step]:not([hidden]) input, fieldset[data-step]:not([hidden]) textarea`,
    )
    for (const field of fields ?? []) {
      if (!field.checkValidity()) {
        field.reportValidity()
        return
      }
    }
    goTo(step + 1)
  }

  const toggleArea = (key: string) =>
    setPickedAreas((previous) =>
      previous.includes(key)
        ? previous.filter((one) => one !== key)
        : previous.length >= AREAS_MAX
          ? previous
          : [...previous, key],
    )

  const toggleInterest = (key: string) =>
    setSelected((previous) =>
      previous.includes(key) ? previous.filter((one) => one !== key) : [...previous, key],
    )

  if (done && state.status === 'done') {
    return (
      <Proposal
        state={state}
        interests={interests}
        onRestart={() => setDismissed(state.requestId)}
        onAddAll={() => {
          // The cart mutation is a server action owned by the /cart route.
          // Until it lands this reports the outcome and pokes the header badge.
          toast(t('c_added'))
          window.dispatchEvent(new Event(CART_CHANGED_EVENT))
          router.push(CART_HREF)
        }}
      />
    )
  }

  return (
    <form
      ref={formRef}
      action={action}
      className={wizard ? 'panel wiz bt-form is-wizard' : 'panel wiz bt-form'}
      noValidate={wizard}
    >
      {/* The catalogue is ordered in the language the form was rendered in. */}
      <input type="hidden" name="locale" value={locale} />

      {wizard && (
        <div className="wiz-head">
          <div className="row between">
            <b style={{ color: 'var(--forest)' }}>{t(STEP_LABELS[step] ?? 'cp_title')}</b>
            <small className="muted">
              {t('cp4_step_of', { n: step + 1, total: STEP_LABELS.length })}
            </small>
          </div>
          <div
            className="wiz-bar"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEP_LABELS.length}
            aria-valuenow={step + 1}
            aria-label={t('cp4_progress')}
          >
            <i style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%` }} />
          </div>
        </div>
      )}
      <div className="wiz-body">
        <fieldset
          className="wiz-step"
          data-step="dates"
          hidden={wizard && step !== 0}
          aria-labelledby={`${baseId}-step-0`}
        >
          <legend className="sr-only" id={`${baseId}-step-0`}>
            {t(STEP_LABELS[0] ?? 'cp_title')}
          </legend>
          {/* ---------------- dates ---------------- */}
          <div>
            <h2 className="bt-form-q">{t('cp_when')}</h2>
            {wizard ? (
              <>
                {/* The shared calendar (v3 custom-trip.html): pick the first and
                    last day; the two hidden fields carry them to the server. */}
                <Calendar
                  mode="range"
                  value={[start === '' ? null : start, end === '' ? null : end]}
                  onChange={([from, to]) => {
                    setStart(from ?? '')
                    setEnd(to ?? '')
                  }}
                  today={todayInBali()}
                  label={t('cp_when')}
                  invalid={errors.dates !== undefined}
                />
                <input type="hidden" name="startDate" value={start} />
                <input type="hidden" name="endDate" value={end} />
              </>
            ) : (
              <div className="bt-daterange">
                <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
                  <span className="bt-flabel">{t('dp_start')}</span>
                  <input
                    name="startDate"
                    type="date"
                    value={start}
                    onChange={(event) => {
                      const next = event.target.value
                      setStart(next)
                      // An end before the start is not a range; clear it rather than
                      // posting something the server has to reject.
                      if (end !== '' && next !== '' && end < next) setEnd('')
                    }}
                    className={errors.dates === undefined ? 'bt-input' : 'bt-input bt-input-err'}
                    aria-invalid={errors.dates !== undefined}
                  />
                </label>

                <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
                  <span className="bt-flabel">{t('dp_end')}</span>
                  <input
                    name="endDate"
                    type="date"
                    value={end}
                    min={start === '' ? undefined : start}
                    onChange={(event) => setEnd(event.target.value)}
                    className={errors.dates === undefined ? 'bt-input' : 'bt-input bt-input-err'}
                    aria-invalid={errors.dates !== undefined}
                    aria-describedby={
                      errors.dates === undefined ? undefined : `${baseId}-dates-err`
                    }
                  />
                </label>
              </div>
            )}
            {errors.dates !== undefined && (
              <FieldError id={`${baseId}-dates-err`}>{t(errors.dates)}</FieldError>
            )}
          </div>
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="travellers"
          hidden={wizard && step !== 1}
          aria-labelledby={`${baseId}-step-1`}
        >
          <legend className="sr-only" id={`${baseId}-step-1`}>
            {t(STEP_LABELS[1] ?? 'cp_title')}
          </legend>
          {/* ---------------- travellers ---------------- */}
          <div>
            <h2 className="bt-form-q">{t('cp_pax')}</h2>
            <Stepper
              value={travellers}
              onChange={setTravellers}
              min={PAX_MIN}
              max={PAX_MAX}
              label={t('cp_pax')}
              decreaseLabel={t('c_qty_dec')}
              increaseLabel={t('c_qty_inc')}
            />
            <input type="hidden" name="travellers" value={travellers} />
          </div>
          {/* ---------------- children / VIP map ---------------- */}
          <div className="row" style={{ gap: 18, flexWrap: 'wrap' }}>
            <label
              className="row"
              style={{ gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14 }}
            >
              <input type="checkbox" name="hasChildren" /> {t('cp_children')}
            </label>
            <label
              className="row"
              style={{ gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14 }}
            >
              <input type="checkbox" name="wantsVipMap" /> {t('cp_vipmap')}
            </label>
            <label
              className="row"
              style={{ gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14 }}
            >
              <input type="checkbox" name="wantsLuxuryDining" /> {t('cp_luxury_dining')}
            </label>
            <label
              className="row"
              style={{ gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14 }}
            >
              <input type="checkbox" name="wantsAdventure" /> {t('cp_adventure')}
            </label>
          </div>
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="areas"
          hidden={wizard && step !== 2}
          aria-labelledby={`${baseId}-step-2`}
        >
          <legend className="sr-only" id={`${baseId}-step-2`}>
            {t(STEP_LABELS[2] ?? 'cp_title')}
          </legend>
          {/* ---------------- preferred areas (spec 5.2) ---------------- */}
          {areas.length > 0 && (
            <div>
              <h2 className="bt-form-q" id={`${baseId}-areas`}>
                {t('cp_areas')}
              </h2>
              <div className="bt-ct-row" role="group" aria-labelledby={`${baseId}-areas`}>
                {areas.map((option) => {
                  const on = pickedAreas.includes(option.key)
                  return (
                    <button
                      key={option.key}
                      type="button"
                      aria-pressed={on}
                      className={on ? 'bt-ct-pick on' : 'bt-ct-pick'}
                      onClick={() => toggleArea(option.key)}
                    >
                      <bdi>{option.label}</bdi>
                    </button>
                  )
                })}
              </div>
              {pickedAreas.map((key) => (
                <input key={key} type="hidden" name="areas" value={key} />
              ))}
            </div>
          )}
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="interests"
          hidden={wizard && step !== 3}
          aria-labelledby={`${baseId}-step-3`}
        >
          <legend className="sr-only" id={`${baseId}-step-3`}>
            {t(STEP_LABELS[3] ?? 'cp_title')}
          </legend>
          {/* ---------------- theme ---------------- */}
          <div>
            <h2 className="bt-form-q" id={`${baseId}-theme`}>
              {t('cp_theme')}
            </h2>
            <div className="bt-ct-row" role="radiogroup" aria-labelledby={`${baseId}-theme`}>
              {FORM_THEMES.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.key}
                  className={theme === option.key ? 'bt-ct-pick on' : 'bt-ct-pick'}
                  onClick={() => setTheme(option.key)}
                >
                  {t(option.labelKey)}
                </button>
              ))}
            </div>
            <input type="hidden" name="theme" value={theme} />
          </div>
          {/* ---------------- interests ---------------- */}
          <div>
            <h2 className="bt-form-q" id={`${baseId}-ints`}>
              {t('cp_acts')}
            </h2>
            <div className="bt-ct-row" role="group" aria-labelledby={`${baseId}-ints`}>
              {interests.map((option) => {
                const on = selected.includes(option.key)
                return (
                  <button
                    key={option.key}
                    type="button"
                    aria-pressed={on}
                    className={on ? 'bt-ct-pick bt-ct-int on' : 'bt-ct-pick bt-ct-int'}
                    onClick={() => toggleInterest(option.key)}
                  >
                    <Icon name={option.icon} size={16} color={on ? '#fff' : 'var(--forest-soft)'} />{' '}
                    {/* Always a real label: the server resolved it from the
                        categories table, so there is no `undefined` to render. */}
                    {option.label}
                  </button>
                )
              })}
            </div>
            {selected.map((key) => (
              <input key={key} type="hidden" name="interests" value={key} />
            ))}
            {errors.interests !== undefined && (
              <FieldError id={`${baseId}-ints-err`}>{t(errors.interests)}</FieldError>
            )}
          </div>
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="budget"
          hidden={wizard && step !== 4}
          aria-labelledby={`${baseId}-step-4`}
        >
          <legend className="sr-only" id={`${baseId}-step-4`}>
            {t(STEP_LABELS[4] ?? 'cp_title')}
          </legend>
          {/* ---------------- budget: a category, never a number ---------------- */}
          <div>
            <h2 className="bt-form-q" id={`${baseId}-budget`}>
              {t('cp_budget')}
            </h2>
            <div className="bt-tier-row" role="radiogroup" aria-labelledby={`${baseId}-budget`}>
              {BUDGET_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  role="radio"
                  aria-checked={budgetTier === tier}
                  className={budgetTier === tier ? 'bt-tier on' : 'bt-tier'}
                  onClick={() => setBudgetTier(tier)}
                >
                  <b>{t(BUDGET_TIER_LABEL[tier])}</b>
                  <small>{t(BUDGET_TIER_HINT[tier])}</small>
                </button>
              ))}
            </div>
            <input type="hidden" name="budgetTier" value={budgetTier} />
          </div>
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="extras"
          hidden={wizard && step !== 5}
          aria-labelledby={`${baseId}-step-5`}
        >
          <legend className="sr-only" id={`${baseId}-step-5`}>
            {t(STEP_LABELS[5] ?? 'cp_title')}
          </legend>
          {/* ---------------- driver (only while the service is on, lib/features.ts) ---------------- */}
          {FEATURES.driver && (
            <div>
              <button
                type="button"
                className={wantsDriver ? 'bt-toggle on' : 'bt-toggle'}
                aria-pressed={wantsDriver}
                style={{ maxWidth: 420 }}
                onClick={() => setWantsDriver((previous) => !previous)}
              >
                <span className="bt-toggle-sw" aria-hidden="true" />
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="car" size={16} color="var(--forest)" /> {t('cp_driver')}
                </span>
              </button>
              {wantsDriver && <input type="hidden" name="wantsDriver" value="on" />}
            </div>
          )}
          {/* ---------------- notes ---------------- */}
          <div>
            <h2 className="bt-form-q">
              <label htmlFor={`${baseId}-notes`}>{t('cp_notes')}</label>
            </h2>
            {basedOn !== null && (
              <p className="muted" style={{ margin: '0 0 6px', fontSize: 13.5 }}>
                {t('p3_custom_based', { name: basedOn })}
              </p>
            )}
            <textarea
              ref={notesRef}
              id={`${baseId}-notes`}
              name="notes"
              maxLength={NOTES_MAX}
              className={errors.notes === undefined ? 'bt-input' : 'bt-input bt-input-err'}
              style={{ minHeight: 110, resize: 'vertical' }}
              placeholder={t('cp_notes_ph')}
            />
            {errors.notes !== undefined && (
              <FieldError id={`${baseId}-notes-err`}>{t(errors.notes)}</FieldError>
            )}
          </div>
        </fieldset>
        <fieldset
          className="wiz-step"
          data-step="contact"
          hidden={wizard && step !== 6}
          aria-labelledby={`${baseId}-step-6`}
        >
          <legend className="sr-only" id={`${baseId}-step-6`}>
            {t(STEP_LABELS[6] ?? 'cp_title')}
          </legend>
          {/* ---------------- contact ---------------- */}
          <div>
            <h2 className="bt-form-q">{t('cp_contact')}</h2>
            <div className="bt-daterange">
              <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
                <span className="bt-flabel">{t('co_name')}</span>
                <input
                  name="name"
                  type="text"
                  autoComplete="name"
                  required
                  maxLength={NAME_MAX}
                  className={errors.name === undefined ? 'bt-input' : 'bt-input bt-input-err'}
                  aria-invalid={errors.name !== undefined}
                  aria-describedby={errors.name === undefined ? undefined : `${baseId}-name-err`}
                />
                {errors.name !== undefined && (
                  <FieldError id={`${baseId}-name-err`}>{t(errors.name)}</FieldError>
                )}
              </label>

              <label className="bt-field" style={{ flex: 1, marginBottom: 0 }}>
                <span className="bt-flabel">{t('co_email')}</span>
                <input
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  className={errors.email === undefined ? 'bt-input' : 'bt-input bt-input-err'}
                  aria-invalid={errors.email !== undefined}
                  aria-describedby={errors.email === undefined ? undefined : `${baseId}-email-err`}
                />
                {errors.email !== undefined && (
                  <FieldError id={`${baseId}-email-err`}>{t(errors.email)}</FieldError>
                )}
              </label>
            </div>

            <label className="bt-field" style={{ marginTop: 12, marginBottom: 0, maxWidth: 420 }}>
              <span className="bt-flabel">{t('auth_phone')}</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={PHONE_MAX}
                className={errors.phone === undefined ? 'bt-input' : 'bt-input bt-input-err'}
                aria-invalid={errors.phone !== undefined}
                aria-describedby={errors.phone === undefined ? undefined : `${baseId}-phone-err`}
              />
              {errors.phone !== undefined && (
                <FieldError id={`${baseId}-phone-err`}>{t(errors.phone)}</FieldError>
              )}
            </label>

            {/* موافقة واتساب صريحة (سياسة Meta): غير محددة افتراضياً، وتُحفظ في الحساب
                إن كان المرسل مسجّلاً. */}
            <label
              className="row"
              style={{ gap: 8, alignItems: 'center', fontWeight: 600, fontSize: 14, marginTop: 10 }}
            >
              <input type="checkbox" name="whatsappOptIn" /> {t('cp_wa_optin')}
            </label>
            <p className="muted" style={{ fontSize: 12.5, margin: '4px 0 0' }}>
              {t('cp_wa_optin_hint')}
            </p>
          </div>
        </fieldset>

        {state.status === 'error' && state.reason === 'server' && (
          <p className="bt-errmsg" role="alert">
            <Icon name="cross" size={12} color="var(--orange-deep)" />
            {t('c_error')}
          </p>
        )}
      </div>
      <div className="wiz-foot">
        {wizard && step > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => goTo(step - 1)}>
            {t('cp4_back')}
          </button>
        ) : (
          <span />
        )}
        {wizard && step < STEP_LABELS.length - 1 ? (
          <button type="button" className="btn btn-primary" onClick={next}>
            {t('cp4_next')} <Icon name="arrow" size={18} className="flip" />
          </button>
        ) : (
          <Button type="submit" variant="orange" disabled={pending}>
            {pending ? t('cp_sending') : t('cp_submit')}{' '}
            <Icon name="arrow" size={18} className="flip" />
          </Button>
        )}
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Proposal
// ---------------------------------------------------------------------------

function Proposal({
  state,
  interests,
  onRestart,
  onAddAll,
}: {
  state: Extract<CustomTripState, { status: 'done' }>
  interests: readonly InterestOption[]
  onRestart: () => void
  onAddAll: () => void
}) {
  const t = useTranslations()
  const format = useFormatter()

  const { answers, recommendations } = state
  const labelFor = (key: string) => interests.find((one) => one.key === key)?.label ?? key

  const calendarDate = (value: string) =>
    format.dateTime(new Date(`${value}T00:00:00Z`), { dateStyle: 'medium', timeZone: 'UTC' })

  const waHref = whatsAppHref(
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER,
    buildMessage({
      intro: t('cp_wa_intro'),
      lines: [
        // The reference ties the chat to the stored lead, so staff open the
        // request rather than asking for all eight answers a second time.
        [t('cp_wa_ref'), state.requestId.slice(0, 8)],
        [t('dp_start'), answers.startDate === null ? '—' : calendarDate(answers.startDate)],
        [t('dp_end'), answers.endDate === null ? '—' : calendarDate(answers.endDate)],
        [t('cp_pax'), format.number(answers.travellers)],
        [t('cp_theme'), t(themeLabelKey(answers.theme))],
        [t('cp_budget'), t(BUDGET_TIER_LABEL[answers.budgetTier])],
        [t('cp_acts'), answers.interests.map(labelFor).join(', ')],
        ...(FEATURES.driver
          ? [[t('cp_driver'), answers.wantsDriver ? t('c_yes') : t('c_no')] as [string, string]]
          : []),
        [t('cp_notes'), answers.notes === '' ? '—' : answers.notes],
      ],
    }),
  )

  return (
    <div className="bt-form">
      <div>
        <p className="eyebrow">
          <span
            aria-hidden="true"
            style={{ width: 18, height: 2, background: 'var(--orange)', borderRadius: 2 }}
          />
          {t('cp_recs_t')}
        </p>
        <h2 className="section-title" style={{ fontSize: 'clamp(26px,4.5vw,40px)', marginTop: 10 }}>
          {t('cp_recs_t')}
        </h2>
        <p className="lede" style={{ marginTop: 12 }}>
          {t('cp_recs_b')}
        </p>
        {/* The lead is stored. Saying so is the difference between a form that
            worked and one that appeared to. */}
        <p className="muted" style={{ marginTop: 8, fontSize: 14 }} role="status">
          {t('cp_saved')}
        </p>
      </div>

      <div className="row" style={{ gap: 8 }}>
        {answers.startDate !== null && answers.endDate !== null && (
          <Tag variant="forest">
            {calendarDate(answers.startDate)} → {calendarDate(answers.endDate)}
          </Tag>
        )}
        {answers.days !== null && (
          <Tag variant="forest">
            {answers.days === 1 ? t('dp_days_one') : t('c_days_n', { n: answers.days })}
          </Tag>
        )}
        <Tag variant="forest">
          {format.number(answers.travellers)} {t('c_guests')}
        </Tag>
        <Tag variant="forest">{t(BUDGET_TIER_LABEL[answers.budgetTier])}</Tag>
        <Tag variant="forest">{t(themeLabelKey(answers.theme))}</Tag>
        {answers.interests.map((key) => (
          <Tag key={key} variant="palm">
            {labelFor(key)}
          </Tag>
        ))}
        {answers.wantsDriver && (
          <Tag variant="orange">
            <Icon name="car" size={12} /> {t('dp_title')}
          </Tag>
        )}
      </div>

      {recommendations.length > 0 ? (
        <div className="grid bt-grid-4">
          {recommendations.map((activity) => (
            <ActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      ) : (
        // The handoff fell back to `ACTIVITIES.slice(0, 4)` and labelled it
        // "recommended for you", which is worse than admitting there was no
        // match — the local team reads the request either way.
        <p className="muted">{t('c_search_empty')}</p>
      )}

      <div className="row" style={{ gap: 10 }}>
        {recommendations.length > 0 && (
          <Button variant="forest" onClick={onAddAll}>
            <Icon name="plus" size={17} color="#fff" /> {t('cp_addall')}
          </Button>
        )}
        {waHref !== null && (
          <LinkButton href={waHref} variant="orange" target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" size={18} color="#fff" /> {t('cp_wa')}
          </LinkButton>
        )}
        <Button variant="ghost" onClick={onRestart}>
          {t('cp_again')}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <p className="bt-errmsg" id={id}>
      <Icon name="cross" size={12} color="var(--orange-deep)" />
      {children}
    </p>
  )
}

function themeLabelKey(theme: ThemeKey): string {
  return THEMES.find((one) => one.key === theme)?.labelKey ?? 'cp_theme'
}

function buildMessage({
  intro,
  lines,
}: {
  intro: string
  lines: readonly (readonly [string, string])[]
}): string {
  const body = lines
    .filter(([, value]) => value !== '')
    .map(([label, value]) => `• ${label}: ${value}`)
    .join('\n')
  return `${intro}\n${body}`
}

/**
 * `https://wa.me/<number>?text=…`, or null when there is no usable number.
 *
 * Digits only, because wa.me rejects `+`, spaces and dashes, and E.164-length
 * because a number outside that range cannot be dialled. Returning null makes
 * the caller drop the button — the prototype rendered it unconditionally
 * against a sixteen-digit placeholder, so it was always a dead link.
 */
function whatsAppHref(raw: string | undefined, message: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length < WA_MIN_DIGITS || digits.length > WA_MAX_DIGITS) return null
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`
}
