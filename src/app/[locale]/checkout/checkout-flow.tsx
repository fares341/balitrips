'use client'

/**
 * Checkout — v3 screens 16 / 16b (prototype checkout.html).
 *
 * Three steps in one form: 1 · your details → 2 · review → 3 · payment.
 * The next step slides in along the reading direction and the progress bar
 * fills (handoff motion: 520ms; reduced motion → an instant switch, through
 * bt.css's global reduced-motion rule). Moving on validates the current step;
 * errors appear under their fields and the first one is scrolled to and
 * focused.
 *
 * Before payment, a trip with activities but no driver gets ONE confirmation
 * dialog offering a car (the only popup the design allows). "Add" puts a
 * linked driver line on each activity over its own dates — the server prices
 * it — and the page re-renders with the new total before payment.
 *
 * Nothing here computes a price. `expectedTotalMinor` is the total the page
 * displayed; the action refuses to charge a different one.
 */

import { startTransition, useActionState, useId, useRef, useState, useTransition } from 'react'
import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Field, Input, Select, Textarea, fieldDescribedBy } from '@/components/bt/field'
import { CART_CHANGED_EVENT, CART_HREF } from '@/components/layout/routes'
import { Modal } from '@/components/shared/modal'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/routing'
import { DIAL_CODES, validateContact, type ContactField } from '@/lib/orders/contact'

import { addDriversAction } from '../my-trip/actions'
import { startCheckoutAction } from './actions'
import { INITIAL_CHECKOUT_STATE, type CheckoutErrorCode, type CheckoutState } from './constants'

export type DriverOffer = {
  itemId: string
  activity: string
  vehicle: string
  days: number
  /** Formatted by the server. */
  price: string
}

export type CheckoutFlowProps = {
  /** Signed-in traveller's display name, or null for a guest. */
  signedInAs: string | null
  /** False when the trip holds account-only products and nobody is signed in. */
  guestAllowed: boolean
  defaults: { name: string; email: string; dialCode: string; phone: string }
  expectedTotalMinor: number
  /** The pay button's amount, formatted by the server. */
  totalLabel: string
  idempotencyKey: string
  /** Server-rendered review of the lines (step 2). */
  review: ReactNode
  /** Server-rendered order summary (the aside). */
  summary: ReactNode
  driverOffers: DriverOffer[]
  /** Sign-in form (server action), rendered by the server. */
  signIn: ReactNode
  /** The card is only held until the supplier confirms (bookings). */
  authorizeOnly?: boolean
}

type Step = 1 | 2 | 3

const SERVER_ERROR: Record<Exclude<CheckoutErrorCode, 'contact' | 'terms'>, string> = {
  bookings_closed: 'bk_closed_b',
  sign_in: 'co_err_signin',
  empty: 'ct2_empty',
  invalid_cart: 'ct2_blocked',
  price_changed: 'chk_err_price',
  capacity: 'chk_err_capacity',
  payment: 'chk_err_payment',
  unknown: 'c_error',
}

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function CheckoutFlow(props: CheckoutFlowProps) {
  const t = useTranslations()
  const locale = useLocale() as Locale
  const router = useRouter()
  const { toast } = useToast()
  const uid = useId()
  const id = (name: string) => `${uid}-${name}`

  const [step, setStep] = useState<Step>(1)
  const [errors, setErrors] = useState<Partial<Record<ContactField | 'terms', string>>>({})
  const [driverAsked, setDriverAsked] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [addingDriver, startDriver] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const topRef = useRef<HTMLOListElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)

  const [state, formAction, pending] = useActionState(
    async (previous: CheckoutState, formData: FormData): Promise<CheckoutState> => {
      const result = await startCheckoutAction(previous, formData)
      // The server re-validates everything; send the traveller back to the
      // step that owns the problem.
      if (result.error === 'contact') {
        setErrors(result.fields ?? {})
        goTo(1, Object.keys(result.fields ?? {})[0] as ContactField | undefined)
      } else if (result.error === 'terms') {
        setErrors({ terms: 'chk_err_terms' })
        goTo(2, 'terms')
      }
      return result
    },
    INITIAL_CHECKOUT_STATE,
  )

  function field(name: string): HTMLInputElement | HTMLTextAreaElement | null {
    return formRef.current?.querySelector<HTMLInputElement>(`[name="${name}"]`) ?? null
  }

  function value(name: string): string {
    return field(name)?.value ?? ''
  }

  /** Show `next`, then bring the first error (or the step's top) into view. */
  function goTo(next: Step, focusField?: string) {
    setStep(next)
    const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
    // After React commits the new step.
    requestAnimationFrame(() => {
      if (focusField !== undefined) {
        const target = field(focusField)
        target?.scrollIntoView({ behavior, block: 'center' })
        target?.focus({ preventScroll: true })
        return
      }
      topRef.current?.scrollIntoView({ behavior, block: 'start' })
      formRef.current
        ?.querySelector<HTMLElement>(`[data-step="${next}"] h2`)
        ?.focus({ preventScroll: true })
    })
  }

  function validateStep1(): boolean {
    const result = validateContact({
      name: value('name'),
      email: value('email'),
      dialCode: value('dialCode'),
      phone: value('phone'),
      notes: value('notes'),
    })
    if (result.ok) {
      setErrors({})
      return true
    }
    setErrors(result.errors)
    const first = (['name', 'email', 'phone', 'notes'] as const).find((f) => result.errors[f])
    if (first) goTo(1, first)
    return false
  }

  function validateStep2(): boolean {
    const accepted = (field('terms') as HTMLInputElement | null)?.checked === true
    if (accepted) {
      setErrors((e) => ({ ...e, terms: undefined }))
      return true
    }
    setErrors((e) => ({ ...e, terms: 'chk_err_terms' }))
    goTo(2, 'terms')
    return false
  }

  function next(from: Step) {
    if (from === 1) {
      if (!props.guestAllowed && props.signedInAs === null) return
      if (validateStep1()) goTo(2)
      return
    }
    if (from === 2) {
      if (!validateStep2()) return
      // One offer per visit: "Continue without" is an answer.
      if (props.driverOffers.length > 0 && !driverAsked) {
        setModalOpen(true)
        return
      }
      goTo(3)
    }
  }

  function answerDriver(add: boolean) {
    setDriverAsked(true)
    setModalOpen(false)
    if (!add) {
      goTo(3)
      return
    }
    startDriver(async () => {
      const result = await addDriversAction(props.driverOffers.map((offer) => offer.itemId))
      window.dispatchEvent(new Event(CART_CHANGED_EVENT))
      if (!result.ok) {
        toast(t(result.reason === 'driver_full' ? 'act_err_driver_full' : 'c_error'), {
          error: true,
        })
      } else {
        toast(t('co_drv_added'))
      }
      // New lines, new total: re-render the server parts before paying.
      router.refresh()
      goTo(3)
    })
  }

  const clearError = (name: ContactField | 'terms') => {
    if (errors[name]) setErrors((e) => ({ ...e, [name]: undefined }))
  }

  const err = (name: ContactField | 'terms') => {
    const key = errors[name]
    return key === undefined ? undefined : t(key)
  }

  const serverError =
    state.error !== null && state.error !== 'contact' && state.error !== 'terms'
      ? state.error
      : null
  const busy = pending || addingDriver
  const stepClass = (n: Step) => `ck-step panel${step === n ? ' on' : ''}`
  const stepState = (n: Step) => (n < step ? 'done' : n === step ? 'cur' : undefined)
  const blockedGuest = !props.guestAllowed && props.signedInAs === null

  return (
    <>
      <ol className="steps ck-steps" aria-label={t('co_steps')} ref={topRef}>
        {([1, 2, 3] as const).map((n) => (
          <li key={n} className={stepState(n)} aria-current={n === step ? 'step' : undefined}>
            <span>
              <span className="num">{`0${n}`}</span> · {t(`co_step${n}`)}
            </span>
          </li>
        ))}
      </ol>

      <div className="ck">
        <form
          ref={formRef}
          noValidate
          className="minw0 ck-form"
          // Dispatched by hand rather than `action={formAction}`: React resets
          // a form after an action, which would wipe the traveller's details
          // and the terms tick whenever the server sends them back to a step.
          onSubmit={(event) => {
            event.preventDefault()
            // Enter in a field moves to the next step; only step 3 pays.
            if (step !== 3) {
              next(step)
              return
            }
            const formData = new FormData(event.currentTarget)
            startTransition(() => formAction(formData))
          }}
        >
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="expectedTotalMinor" value={props.expectedTotalMinor} />
          <input type="hidden" name="idempotencyKey" value={props.idempotencyKey} />

          {/* ---------------- 1 · Your details ---------------- */}
          <section
            className={stepClass(1)}
            data-step="1"
            hidden={step !== 1}
            aria-labelledby={id('s1')}
          >
            <h2 className="h3" id={id('s1')} tabIndex={-1}>
              {t('co_s1_t')}
            </h2>
            {props.signedInAs !== null ? (
              <div className="alert alert-ok">
                <Icon name="user" size={18} />
                <span>
                  {t('co_signed_in')} <b style={{ display: 'inline' }}>{props.signedInAs}</b>
                </span>
              </div>
            ) : props.guestAllowed ? (
              <div className="alert alert-info ck-guest">
                <Icon name="info" size={18} />
                <span>
                  {t('co_have_account')} {props.signIn} {t('co_or_guest')}
                </span>
              </div>
            ) : (
              <div className="alert alert-warn ck-guest">
                <Icon name="lock" size={18} />
                <span>
                  <b>{t('co_account_needed_t')}</b>
                  {t('co_account_needed_b')} {props.signIn}
                </span>
              </div>
            )}

            <div className="two">
              <Field id={id('name')} label={t('co_name_l')} error={err('name')}>
                <Input
                  id={id('name')}
                  name="name"
                  autoComplete="name"
                  defaultValue={props.defaults.name}
                  invalid={errors.name !== undefined}
                  aria-describedby={fieldDescribedBy(id('name'), { error: err('name') })}
                  onInput={() => clearError('name')}
                />
              </Field>
              <Field id={id('email')} label={t('co_email_l')} error={err('email')}>
                <Input
                  id={id('email')}
                  name="email"
                  type="email"
                  dir="ltr"
                  autoComplete="email"
                  inputMode="email"
                  defaultValue={props.defaults.email}
                  invalid={errors.email !== undefined}
                  aria-describedby={fieldDescribedBy(id('email'), { error: err('email') })}
                  onInput={() => clearError('email')}
                />
              </Field>
            </div>

            <Field
              id={id('phone')}
              label={t('co_phone_l')}
              hint={t('co_phone_hint')}
              error={err('phone')}
            >
              <div className="ck-phone">
                <Select
                  name="dialCode"
                  aria-label={t('co_dial')}
                  dir="ltr"
                  defaultValue={props.defaults.dialCode}
                  onChange={() => clearError('phone')}
                >
                  {DIAL_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </Select>
                <Input
                  id={id('phone')}
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  dir="ltr"
                  autoComplete="tel-national"
                  defaultValue={props.defaults.phone}
                  invalid={errors.phone !== undefined}
                  aria-describedby={fieldDescribedBy(id('phone'), {
                    hint: t('co_phone_hint'),
                    error: err('phone'),
                  })}
                  onInput={() => clearError('phone')}
                />
              </div>
            </Field>

            <Field id={id('notes')} label={t('co_notes_l')} error={err('notes')}>
              <Textarea
                id={id('notes')}
                name="notes"
                maxLength={500}
                placeholder={t('co_notes_ph')}
                invalid={errors.notes !== undefined}
                aria-describedby={fieldDescribedBy(id('notes'), { error: err('notes') })}
                onInput={() => clearError('notes')}
              />
            </Field>

            <div className="ck-nav">
              <Link className="btn btn-ghost" href={CART_HREF}>
                {t('co_back_trip')}
              </Link>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                disabled={blockedGuest}
                onClick={() => next(1)}
              >
                {t('co_to_review')}
              </button>
            </div>
          </section>

          {/* ---------------- 2 · Review ---------------- */}
          <section
            className={stepClass(2)}
            data-step="2"
            hidden={step !== 2}
            aria-labelledby={id('s2')}
          >
            <h2 className="h3" id={id('s2')} tabIndex={-1}>
              {t('co_s2_t')}
            </h2>
            {props.review}
            <div className="alert alert-warn">
              <Icon name="info" size={18} />
              <span>
                <b>{t('co_policies_t')}</b>
                {t('co_policies_b')}{' '}
                <Link className="link" href="/refund">
                  {t('co_policy_read')}
                </Link>
              </span>
            </div>
            {/* Client, Oct 2026: the site-wide cancellation policy, and how
                a booking is paid, stated before the customer agrees. */}
            <div className="alert alert-info">
              <Icon name="shield" size={18} />
              <span>
                <b>{t('chk_cancel_policy_t')}: </b>
                {t('cancel_default')}
              </span>
            </div>
            {props.authorizeOnly === true && (
              <div className="alert alert-info">
                <Icon name="info" size={18} />
                <span>{t('chk_auth_hold')}</span>
              </div>
            )}
            <div className={`field${errors.terms ? ' has-error' : ''}`}>
              <label className="check" htmlFor={id('terms')}>
                <input
                  id={id('terms')}
                  type="checkbox"
                  name="terms"
                  aria-invalid={errors.terms !== undefined || undefined}
                  aria-describedby={errors.terms ? `${id('terms')}-err` : undefined}
                  onChange={() => clearError('terms')}
                />
                <span>
                  {t('co_agree')}{' '}
                  <Link className="link" href="/terms">
                    {t('ft_p_terms')}
                  </Link>{' '}
                  {t('co_and')}{' '}
                  <Link className="link" href="/refund">
                    {t('ft_p_refund')}
                  </Link>
                </span>
              </label>
              {/* Owner, Oct 2026: every policy reachable from checkout. */}
              <small className="muted co-pol-links">
                {t('chk_more_policies')}{' '}
                <Link className="link" href="/payment-policy">
                  {t('ft_p_payment')}
                </Link>
                {' · '}
                <Link className="link" href="/privacy">
                  {t('ft_p_privacy')}
                </Link>
                {' · '}
                <Link className="link" href="/cookies">
                  {t('ft_p_cookies')}
                </Link>
              </small>
              {errors.terms && (
                <span className="err" id={`${id('terms')}-err`} role="alert">
                  <Icon name="alert" size={15} /> <span>{t(errors.terms)}</span>
                </span>
              )}
            </div>
            {/* WhatsApp booking updates (proposal §11): explicit consent, unticked. */}
            <div className="field">
              <label className="check" htmlFor={id('wa-consent')}>
                <input id={id('wa-consent')} type="checkbox" name="whatsappConsent" />
                <span>{t('co_wa_consent')}</span>
              </label>
            </div>
            {/* Phase 4: offers by e-mail/WhatsApp — never ticked for the traveller. */}
            <div className="field">
              <label className="check" htmlFor={id('marketing')}>
                <input id={id('marketing')} type="checkbox" name="marketingConsent" />
                <span>{t('co_marketing')}</span>
              </label>
            </div>
            <div className="ck-nav">
              <button type="button" className="btn btn-ghost" onClick={() => goTo(1)}>
                {t('co_back')}
              </button>
              <button
                type="button"
                className={`btn btn-primary btn-lg${addingDriver ? ' is-loading' : ''}`}
                aria-busy={addingDriver || undefined}
                disabled={addingDriver}
                onClick={() => next(2)}
              >
                {t('co_to_payment')}
              </button>
            </div>
          </section>

          {/* ---------------- 3 · Payment ---------------- */}
          <section
            className={stepClass(3)}
            data-step="3"
            hidden={step !== 3}
            aria-labelledby={id('s3')}
          >
            <h2 className="h3" id={id('s3')} tabIndex={-1}>
              {t('co_s3_t')}
            </h2>
            {serverError !== null && (
              <div className="alert alert-err" role="alert">
                <Icon name="alert" size={18} />
                <span>
                  {t(SERVER_ERROR[serverError])}
                  {serverError === 'price_changed' && state.newTotalLabel !== undefined ? (
                    <b dir="ltr" style={{ display: 'inline' }}>
                      {' '}
                      {state.newTotalLabel}
                    </b>
                  ) : null}
                </span>
              </div>
            )}
            <ul className="pm" aria-label={t('co_methods')}>
              <li>
                <Icon name="card" size={22} />
                <span>
                  <b>{t('co_pm_card')}</b>
                  <small className="muted" dir="ltr">
                    Visa · Mastercard · Amex
                  </small>
                </span>
              </li>
              <li>
                <Icon name="phone" size={22} />
                <span>
                  <b dir="ltr">Apple Pay · Google Pay</b>
                  <small className="muted">{t('co_pm_wallet')}</small>
                </span>
              </li>
            </ul>
            <p className="ck-secure">
              <Icon name="shield" size={16} /> {t('co_secure')}
            </p>
            <div className="ck-nav">
              <button type="button" className="btn btn-ghost" onClick={() => goTo(2)}>
                {t('co_back')}
              </button>
              <button
                type="submit"
                className={`btn btn-primary btn-lg${busy ? ' is-loading' : ''}`}
                aria-busy={busy || undefined}
                disabled={busy}
              >
                {t('co_pay')} <span dir="ltr">{props.totalLabel}</span>
              </button>
            </div>
          </section>
        </form>

        {props.summary}
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        labelledBy={id('drv')}
        initialFocus={addRef}
        scrimClassName="modal-scrim open"
        panelClassName="modal stack drv-modal"
        showClose={false}
      >
        <span className="drv-ill" aria-hidden="true">
          <Icon name="car" size={30} />
        </span>
        <h2 className="h3" id={id('drv')}>
          {t('act_drv_modal_t')}
        </h2>
        <p className="muted">{t('co_drv_b')}</p>
        {props.driverOffers.map((offer) => (
          <div key={offer.itemId} className="sum-row drv-modal-row">
            <span className="minw0">
              <b>{offer.activity}</b>
              <small className="muted">
                {offer.vehicle} · {t('act_days_n', { n: offer.days })}
              </small>
            </span>
            <b className="price" dir="ltr">
              +{offer.price}
            </b>
          </div>
        ))}
        <div className="row">
          <button
            ref={addRef}
            type="button"
            className="btn btn-primary"
            onClick={() => answerDriver(true)}
          >
            {t('act_drv_modal_add')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => answerDriver(false)}>
            {t('act_drv_modal_skip')}
          </button>
        </div>
      </Modal>
    </>
  )
}
