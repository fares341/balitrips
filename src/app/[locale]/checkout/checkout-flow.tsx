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
 * The steps are browser-history entries (`?step=2`, `?step=3`), so Back and
 * Forward move between them instead of leaving checkout (audit M2). What the
 * traveller typed in step 1 is kept in sessionStorage (`./contact-draft`), so
 * it survives leaving the page, a reload and the sign-in round trip. Only the
 * contact fields are kept — there are no card fields on this site at all.
 *
 * The phone field is the registration one (`PhoneField`): every country,
 * mobile numbers only; the server checks it again (`@/lib/orders/contact`).
 *
 * Nothing here computes a price. `expectedTotalMinor` is the total the page
 * displayed; the action refuses to charge a different one.
 */

import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from 'react'
import type { ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import {
  PhoneField,
  defaultCountry,
  hasSavedCountry,
  useVisitorCountry,
} from '@/components/auth/fields'
import { Field, Input, Textarea, fieldDescribedBy } from '@/components/bt/field'
import { CART_CHANGED_EVENT, CART_HREF, policyLink } from '@/components/layout/routes'
import { Modal } from '@/components/shared/modal'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/routing'
import { formatE164 } from '@/lib/auth/phone'
import { contactPhone, validateContact, type ContactField } from '@/lib/orders/contact'

import { addDriversAction } from '../my-trip/actions'
import { startCheckoutAction } from './actions'
import {
  CHECKOUT_HREF,
  INITIAL_CHECKOUT_STATE,
  SIGN_IN_PAGE_HREF,
  SIGN_UP_PAGE_HREF,
  type CheckoutErrorCode,
  type CheckoutState,
} from './constants'
import { readContactDraft, writeContactDraft, type ContactDraft } from './contact-draft'

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
  /** Signed-in traveller's id, or null: whose contact draft may be restored. */
  userId: string | null
  /** False when the trip holds account-only products and nobody is signed in. */
  guestAllowed: boolean
  /**
   * From the account. `phoneCountry` is the saved number's own country, or
   * null to start from where the visitor is (as registration does).
   */
  defaults: { name: string; email: string; phoneCountry: string | null; phone: string }
  /** The trip holds a digital product (itinerary file, map access). */
  hasDigital: boolean
  expectedTotalMinor: number
  /** The pay button's amount, formatted by the server (the SAR charge). */
  totalLabel: string
  /** "Charged in SAR: X" + the visitor's approximate amount, server-rendered. */
  chargeNote?: ReactNode
  idempotencyKey: string
  /** Server-rendered review of the lines (step 2). */
  review: ReactNode
  /** Server-rendered order summary (the aside). */
  summary: ReactNode
  driverOffers: DriverOffer[]
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

const subscribeNothing = () => () => undefined
const isClient = () => true
const isServer = () => false

function stepInUrl(): Step {
  const value = new URLSearchParams(window.location.search).get('step')
  return value === '2' ? 2 : value === '3' ? 3 : 1
}

/** This page's URL for a step; step 1 is the bare /checkout. */
function urlForStep(step: Step): string {
  const url = new URL(window.location.href)
  if (step === 1) url.searchParams.delete('step')
  else url.searchParams.set('step', String(step))
  return `${url.pathname}${url.search}`
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
  const blockedGuest = !props.guestAllowed && props.signedInAs === null

  // null until the traveller moves; until then the step is the URL's (a
  // reload or Forward into `?step=2`), as far as the form allows it.
  const [movedTo, setStep] = useState<Step | null>(null)
  const [errors, setErrors] = useState<Partial<Record<ContactField | 'terms', string>>>({})
  const [driverAsked, setDriverAsked] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [addingDriver, startDriver] = useTransition()
  const hydrated = useSyncExternalStore(subscribeNothing, isClient, isServer)
  const formRef = useRef<HTMLFormElement>(null)
  const topRef = useRef<HTMLOListElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  /** Step entries this visit pushed that lie behind the current one. */
  const depth = useRef(0)
  /** A field to focus once Back has landed on its step. */
  const focusAfterPop = useRef<string | undefined>(undefined)

  // ---- Step 1 values: typed now, else this tab's draft, else the account ----
  const [edits, setEdits] = useState<Partial<ContactDraft>>({})
  // sessionStorage does not exist on the server: read once hydrated.
  const stored = useMemo(
    () => (hydrated ? readContactDraft(props.userId) : null),
    [hydrated, props.userId],
  )
  const [ipCountry, setIpCountry] = useState<string | null>(null)
  useVisitorCountry(setIpCountry)
  const contact: ContactDraft = {
    name: edits.name ?? stored?.name ?? props.defaults.name,
    email: edits.email ?? stored?.email ?? props.defaults.email,
    phone: edits.phone ?? stored?.phone ?? props.defaults.phone,
    notes: edits.notes ?? stored?.notes ?? '',
    // The picker: a choice made here, the saved number's country, then the
    // same default as registration (the last pick, else where the visitor is).
    phoneCountry:
      edits.phoneCountry ??
      stored?.phoneCountry ??
      props.defaults.phoneCountry ??
      (hydrated
        ? hasSavedCountry()
          ? defaultCountry(locale)
          : (ipCountry ?? defaultCountry(locale))
        : locale === 'id'
          ? 'ID'
          : 'SA'),
  }
  const e164 = contactPhone(contact)
  // For the popstate listener, which outlives any one render.
  const latest = useRef({ contact, blockedGuest })
  useEffect(() => {
    latest.current = { contact, blockedGuest }
  })

  function edit(name: keyof ContactDraft, value: string) {
    setEdits((current) => ({ ...current, [name]: value }))
    writeContactDraft({ ...contact, [name]: value }, props.userId)
    clearError(name === 'phoneCountry' ? 'phone' : name)
  }

  // A later step only shows over a valid step 1 (and never to a guest who
  // must sign in). The terms tick is not restored, so a reload stops at 2.
  const urlStep: Step =
    hydrated && !blockedGuest && stepInUrl() > 1 && validateContact(contact).ok ? 2 : 1
  const step: Step = movedTo ?? urlStep

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
    // The phone's own input belongs to PhoneField; `phone` is a hidden copy.
    const selector = name === 'phone' ? '[data-step="1"] input[type="tel"]' : `[name="${name}"]`
    return formRef.current?.querySelector<HTMLInputElement>(selector) ?? null
  }

  const termsAccepted = () => (field('terms') as HTMLInputElement | null)?.checked === true

  /** Bring the first error (or the step's top) into view. */
  function focusStep(shown: Step, focusField?: string) {
    const behavior: ScrollBehavior = reducedMotion() ? 'auto' : 'smooth'
    if (focusField !== undefined) {
      const target = field(focusField)
      target?.scrollIntoView({ behavior, block: 'center' })
      target?.focus({ preventScroll: true })
      return
    }
    topRef.current?.scrollIntoView({ behavior, block: 'start' })
    formRef.current
      ?.querySelector<HTMLElement>(`[data-step="${shown}"] h2`)
      ?.focus({ preventScroll: true })
  }

  // A reload on `?step=3`, or a guest who must sign in: the URL says a step
  // the form cannot show yet. Put the URL back in step with the page.
  useEffect(() => {
    if (hydrated && movedTo === null && stepInUrl() !== step) {
      window.history.replaceState(null, '', urlForStep(step))
    }
    // Once, when the draft has been read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated])

  // Browser Back / Forward: the URL says which step, the form says whether
  // it may be shown (Forward into payment after un-ticking the terms may not).
  useEffect(() => {
    const onPop = () => {
      const wanted = stepInUrl()
      const now = latest.current
      const valid = !now.blockedGuest && validateContact(now.contact).ok
      const allowed: Step =
        wanted === 1 || !valid ? 1 : wanted === 3 && !termsAccepted() ? 2 : wanted
      if (allowed !== wanted) window.history.replaceState(null, '', urlForStep(allowed))
      setStep((current) => {
        depth.current = Math.max(0, depth.current + allowed - (current ?? allowed))
        return allowed
      })
      setModalOpen(false)
      const focusField = focusAfterPop.current
      focusAfterPop.current = undefined
      requestAnimationFrame(() => focusStep(allowed, focusField))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
    // Mounted once: everything it reads is a ref, the DOM or the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Show `next`. Forward adds a history entry; going back returns to the
   * entry already there, so the browser's Back and the page's "Back" button
   * do the same thing and Forward still works afterwards.
   */
  function goTo(next: Step, focusField?: string) {
    const delta = next - step
    if (delta < 0 && depth.current >= -delta) {
      // The popstate listener shows the step.
      focusAfterPop.current = focusField
      window.history.go(delta)
      return
    }
    if (delta > 0) {
      window.history.pushState(null, '', urlForStep(next))
      depth.current += delta
    } else if (delta < 0) {
      // Arrived by reload or Forward: no entry of this visit to go back to.
      window.history.replaceState(null, '', urlForStep(next))
    }
    setStep(next)
    // After React commits the new step.
    requestAnimationFrame(() => focusStep(next, focusField))
  }

  function validateStep1(): boolean {
    const result = validateContact(contact)
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
    if (termsAccepted()) {
      setErrors((e) => ({ ...e, terms: undefined }))
      return true
    }
    setErrors((e) => ({ ...e, terms: 'chk_err_terms' }))
    goTo(2, 'terms')
    return false
  }

  function next(from: Step) {
    if (from === 1) {
      if (blockedGuest) return
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
  const signInHref = { pathname: SIGN_IN_PAGE_HREF, query: { next: CHECKOUT_HREF } }
  const signUpHref = { pathname: SIGN_UP_PAGE_HREF, query: { next: CHECKOUT_HREF } }

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
                  {t('co_have_account')}{' '}
                  <Link className="link" href={signInHref}>
                    {t('co_log_in')}
                  </Link>{' '}
                  {t('co_or_guest')}
                </span>
              </div>
            ) : (
              // The trip holds something that lives in an account (an itinerary
              // file, map access). Plain links, not a form: a <form> inside the
              // checkout form is invalid HTML — the browser drops it, so the old
              // button did nothing (audit C1). The trip stays in the cart and is
              // folded into the account when the traveller comes back here.
              <div className="ck-need-account">
                <span className="ck-need-ill" aria-hidden="true">
                  <Icon name="lock" size={26} />
                </span>
                <b>{t('co_account_needed_t')}</b>
                <p className="muted">{t('co_account_needed_b')}</p>
                <div className="ck-need-cta">
                  <Link className="btn btn-primary btn-lg" href={signInHref}>
                    {t('co_log_in')}
                  </Link>
                  <Link className="btn btn-ghost btn-lg" href={signUpHref}>
                    {t('co_sign_up')}
                  </Link>
                </div>
                <small className="muted">{t('co_account_needed_keep')}</small>
              </div>
            )}

            {/* A guest who must sign in first gets no fields to fill in vain
                (audit L10); the account's details prefill them afterwards. */}
            {!blockedGuest && (
              <>
                <div className="two">
                  <Field id={id('name')} label={t('co_name_l')} error={err('name')}>
                    <Input
                      id={id('name')}
                      name="name"
                      autoComplete="name"
                      maxLength={120}
                      value={contact.name}
                      onChange={(event) => edit('name', event.target.value)}
                      invalid={errors.name !== undefined}
                      aria-describedby={fieldDescribedBy(id('name'), { error: err('name') })}
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
                      maxLength={200}
                      value={contact.email}
                      onChange={(event) => edit('email', event.target.value)}
                      invalid={errors.email !== undefined}
                      aria-describedby={fieldDescribedBy(id('email'), { error: err('email') })}
                    />
                  </Field>
                </div>

                {/* Lead capture: the WhatsApp number is where the schedule and
                    the confirmation go — made prominent. The same field and the
                    same rules as registration; the server checks it again. */}
                <div className="ck-wa-box">
                  <PhoneField
                    label={t('co_phone_l')}
                    value={contact.phone}
                    onChange={(value) => edit('phone', value)}
                    country={contact.phoneCountry}
                    onCountryChange={(iso) => edit('phoneCountry', iso)}
                    error={errors.phone ?? null}
                    maxLength={32}
                  />
                  <input type="hidden" name="phone" value={contact.phone} />
                  <input type="hidden" name="phoneCountry" value={contact.phoneCountry} />
                  <small className="muted ck-wa-note">
                    <Icon name="whatsapp" size={15} /> {t('co_phone_hint')}
                  </small>
                </div>

                <Field id={id('notes')} label={t('co_notes_l')} error={err('notes')}>
                  <Textarea
                    id={id('notes')}
                    name="notes"
                    maxLength={500}
                    placeholder={t('co_notes_ph')}
                    value={contact.notes}
                    onChange={(event) => edit('notes', event.target.value)}
                    invalid={errors.notes !== undefined}
                    aria-describedby={fieldDescribedBy(id('notes'), { error: err('notes') })}
                  />
                </Field>
              </>
            )}

            <div className="ck-nav">
              <Link className="btn btn-ghost" href={CART_HREF}>
                {t('co_back_trip')}
              </Link>
              {!blockedGuest && (
                <button type="button" className="btn btn-primary btn-lg" onClick={() => next(1)}>
                  {t('co_to_review')}
                </button>
              )}
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
            {/* What step 1 collected, read back before paying: a typo in the
                WhatsApp number is caught here, not after the charge (audit M11). */}
            <div className="ck-contact" role="group" aria-labelledby={id('rc')}>
              <div className="ck-contact-h">
                <b id={id('rc')}>{t('co_rev_contact_t')}</b>
                <button type="button" className="link" onClick={() => goTo(1)}>
                  <Icon name="edit" size={14} /> {t('co_rev_edit')}
                </button>
              </div>
              <dl>
                <div>
                  <dt>{t('co_name_l')}</dt>
                  <dd>
                    <bdi>{contact.name.trim()}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t('co_email_l')}</dt>
                  <dd>
                    <bdi dir="ltr">{contact.email.trim().toLowerCase()}</bdi>
                  </dd>
                </div>
                <div>
                  <dt>{t('co_phone_l')}</dt>
                  <dd>
                    <bdi dir="ltr">{e164 === null ? contact.phone : formatE164(e164)}</bdi>
                  </dd>
                </div>
                {contact.notes.trim() !== '' && (
                  <div className="ck-contact-notes">
                    <dt>{t('co_rev_notes')}</dt>
                    <dd>{contact.notes.trim()}</dd>
                  </div>
                )}
              </dl>
              <small className="muted">{t('co_rev_contact_hint')}</small>
            </div>
            {props.review}
            {/* One statement of the policy (audit L9): the site-wide
                cancellation terms (client, Oct 2026) and, when the trip holds
                one, the digital-product rule — no second box saying otherwise. */}
            <div className="alert alert-info">
              <Icon name="shield" size={18} />
              <span>
                <b>{t('chk_cancel_policy_t')}: </b>
                {t('cancel_default')}
                {props.hasDigital ? ` ${t('co_policies_digital')}` : ''}{' '}
                <Link className="link" href={policyLink('/refund', locale)}>
                  {t('co_policy_read')}
                </Link>
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
                  <Link className="link" href={policyLink('/terms', locale)}>
                    {t('ft_p_terms')}
                  </Link>{' '}
                  {t('co_and')}{' '}
                  <Link className="link" href={policyLink('/refund', locale)}>
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
                <Link className="link" href={policyLink('/privacy', locale)}>
                  {t('ft_p_privacy')}
                </Link>
                {' · '}
                <Link className="link" href={policyLink('/cookies', locale)}>
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
                <Icon name="mobile" size={22} />
                <span>
                  <b dir="ltr">Apple Pay · Google Pay</b>
                  <small className="muted">{t('co_pm_wallet')}</small>
                </span>
              </li>
            </ul>
            {props.chargeNote}
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
                {t('co_pay')} <bdi dir="auto">{props.totalLabel}</bdi>
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
