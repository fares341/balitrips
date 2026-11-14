'use client'

/**
 * Form controls for the auth sheet.
 *
 * The handoff's `Field` was a bare `<input>` inside a `<label>` with roughly
 * forty lines of inline style and two handlers that mutated
 * `e.target.style.borderColor` on focus. The visual result is identical here
 * and comes from `.bt-flabel` / `.bt-input` / `.bt-input-err` / `.bt-errmsg`
 * in components.css, which already carry the focus state as a real `:focus`
 * rule.
 *
 * What is new is everything an error state needs:
 *
 *  - `htmlFor`/`id`, so clicking the label focuses the box (the handoff wrapped
 *    the input in the label, which works, but breaks the moment a second
 *    element — the error text — joins it);
 *  - `aria-invalid` and `aria-describedby`, so a screen reader announces the
 *    problem instead of leaving an unexplained red border;
 *  - `role="alert"` on the message, so it is announced when it appears;
 *  - `maxLength`, matched to the column width, so a paste is truncated at the
 *    box rather than 500-ing at Postgres.
 *
 * Errors arrive as message KEYS and are translated here, so no caller has to
 * remember to do it.
 */

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { useLocale, useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'
import {
  DIAL_CODES,
  dialOf,
  exampleLocal,
  formatE164,
  isTooLong,
  guessCountry,
  hasIntlPrefix,
  isPhoneLike,
  toE164,
  withCountry,
} from '@/lib/auth/phone'

type BaseProps = {
  label: string
  /** Key into messages/*.json, or null when the field is fine. */
  error?: string | null
  /** Rendered under the control when there is no error. */
  hint?: string
  disabled?: boolean
  /** Appended to the label, e.g. the shared "Optional" string. */
  optionalLabel?: string
}

function useFieldIds(error: string | null | undefined, hint: string | undefined) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const described = [error ? errorId : null, !error && hint ? hintId : null].filter(
    (value): value is string => value !== null,
  )

  return {
    id,
    errorId,
    hintId,
    describedBy: described.length > 0 ? described.join(' ') : undefined,
  }
}

function FieldMessage({
  error,
  errorId,
  hint,
  hintId,
}: {
  error: string | null | undefined
  errorId: string
  hint: string | undefined
  hintId: string
}) {
  const t = useTranslations()

  if (error) {
    return (
      <p className="bt-errmsg" id={errorId} role="alert">
        <Icon name="cross" size={13} />
        {t(error)}
      </p>
    )
  }

  if (hint === undefined) return null

  return (
    <p id={hintId} className="muted" style={{ fontSize: 13, marginTop: 6, marginBottom: 0 }}>
      {hint}
    </p>
  )
}

export type TextFieldProps = BaseProps & {
  type?: 'text' | 'email' | 'password' | 'tel'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoComplete?: string
  maxLength?: number
  autoFocus?: boolean
  inputMode?: 'text' | 'email' | 'tel'
}

export function TextField({
  label,
  error,
  hint,
  disabled = false,
  optionalLabel,
  type = 'text',
  value,
  onChange,
  placeholder,
  autoComplete,
  maxLength,
  autoFocus = false,
  inputMode,
}: TextFieldProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)
  const t = useTranslations()
  // Client, Oct 2026: a show/hide eye on every password field.
  const [shown, setShown] = useState(false)
  const isPassword = type === 'password'

  const input = (
    <input
      id={id}
      className={error ? 'bt-input bt-input-err' : 'bt-input'}
      type={isPassword && shown ? 'text' : type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      maxLength={maxLength}
      inputMode={inputMode}
      disabled={disabled}
      // Only ever set on the first field of a dialog the visitor
      // deliberately opened, where focus has to move inside anyway.
      autoFocus={autoFocus}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      style={isPassword ? { paddingInlineEnd: 44 } : undefined}
    />
  )

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
        {optionalLabel !== undefined && (
          <span className="muted" style={{ fontWeight: 600 }}>
            {' '}
            · {optionalLabel}
          </span>
        )}
      </label>
      {isPassword ? (
        <div style={{ position: 'relative' }}>
          {input}
          <button
            type="button"
            className="bt-pw-eye"
            onClick={() => setShown((value) => !value)}
            aria-label={t(shown ? 'pw_hide' : 'pw_show')}
            aria-pressed={shown}
            aria-controls={id}
            disabled={disabled}
            style={{
              position: 'absolute',
              insetInlineEnd: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 36,
              height: 36,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              background: 'transparent',
              color: 'var(--ink-soft, #555)',
              cursor: 'pointer',
              borderRadius: 8,
            }}
          >
            <Icon name="eye" size={18} />
            {shown && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  width: 20,
                  height: 2,
                  background: 'currentColor',
                  transform: 'rotate(-45deg)',
                  borderRadius: 1,
                }}
              />
            )}
          </button>
        </div>
      ) : (
        input
      )}
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/**
 * الدولة الافتراضية لخانة الجوال، بالترتيب: آخر دولة اختارها الزائر بنفسه،
 * ثم البلد الذي يدخل منه (من عنوان IP عبر `/api/currency`، محفوظ للجلسة)،
 * ثم منطقة المتصفح، ثم لغة الصفحة.
 */
export function defaultCountry(locale: string): string {
  if (typeof window === 'undefined') return locale === 'id' ? 'ID' : 'SA'
  for (const [store, key] of [
    [window.localStorage, 'bt-phone-country'],
    [window.sessionStorage, 'bt-ip-country'],
  ] as const) {
    try {
      const saved = store.getItem(key)
      if (saved && DIAL_CODES.some((c) => c.iso === saved)) return saved
    } catch {
      /* storage blocked */
    }
  }
  return guessCountry(locale, window.navigator.languages ?? [window.navigator.language])
}

/**
 * يسأل الخادم مرة واحدة في الجلسة عن بلد الزائر (IP) ويستدعي `onCountry`
 * إن عُرف. لا شيء إن فشل الطلب: يبقى التخمين من المتصفح.
 */
export function useVisitorCountry(onCountry: (iso: string) => void): void {
  useEffect(() => {
    let cached: string | null = null
    try {
      cached = window.sessionStorage.getItem('bt-ip-country')
    } catch {
      /* storage blocked */
    }
    if (cached !== null) return
    let alive = true
    fetch('/api/currency', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { country?: string | null } | null) => {
        const iso = data?.country?.toUpperCase()
        if (!alive || !iso || !DIAL_CODES.some((c) => c.iso === iso)) return
        try {
          window.sessionStorage.setItem('bt-ip-country', iso)
        } catch {
          /* storage blocked */
        }
        onCountry(iso)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // Once per mount; the callback only sets state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** هل اختار الزائر دولة بنفسه في زيارة سابقة؟ */
export function hasSavedCountry(): boolean {
  try {
    return window.localStorage.getItem('bt-phone-country') !== null
  } catch {
    return false
  }
}

/** يحفظ اختيار الدولة لزيارة قادمة (راحة فقط). */
export function rememberCountry(iso: string): void {
  try {
    window.localStorage.setItem('bt-phone-country', iso)
  } catch {
    /* storage blocked */
  }
}

const flag = (iso: string) =>
  String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))

const noSubscription = () => () => undefined

/**
 * Country names from the browser's own data. Null until hydration is done:
 * Node and the browser spell some regions differently, and a different
 * <option> text between the two is a hydration error.
 */
function useRegionNames() {
  const locale = useLocale()
  const hydrated = useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  )
  return useMemo(() => {
    if (!hydrated) return null
    try {
      return new Intl.DisplayNames([locale], { type: 'region' })
    } catch {
      return null
    }
  }, [locale, hydrated])
}

/** «🇸🇦 +966 ▾» مضغوط وهو مغلق، وقائمة كل الدول بأسمائها وهو مفتوح. */
function CountryCodePicker({
  iso,
  onChange,
  disabled,
}: {
  iso: string
  onChange: (iso: string) => void
  disabled?: boolean
}) {
  const t = useTranslations()
  const names = useRegionNames()
  return (
    <span
      className="bt-input"
      dir="ltr"
      style={{
        position: 'relative',
        flex: '0 0 auto',
        width: 'auto',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        paddingInline: 12,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {flag(iso)} +{dialOf(iso)}
      <Icon name="chevron" size={14} />
      <select
        aria-label={t('auth_dial_code')}
        value={iso}
        onChange={(event) => {
          onChange(event.target.value)
          rememberCountry(event.target.value)
        }}
        disabled={disabled}
        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
      >
        {DIAL_CODES.map((c) => (
          <option key={c.iso} value={c.iso}>
            {flag(c.iso)} +{c.dial} {names?.of(c.iso) ?? c.iso}
          </option>
        ))}
      </select>
    </span>
  )
}

/**
 * خانة الدخول: بريد إلكتروني أو رقم جوال في نفس المربع.
 *
 *  - فيها حرف أو @ ⇒ بريد، تُرسل كما هي.
 *  - أرقام فقط ⇒ جوال: يظهر اختيار الدولة بجانب الرقم، ويُكمَّل الرقم حسبها
 *    (صفر البداية المحلي يُحذف). من يكتب + أو 00 يكتب الرمز بنفسه فيختفي الاختيار.
 *  - تحت الخانة: الرقم كما سيُرسل (‎+966 50 123 4567) ليتأكد منه الزائر.
 *
 * القيمة المرسلة تُحسب بـ `withCountry(value, country)` عند الإرسال.
 */
export function IdentifierField({
  label,
  error,
  disabled = false,
  value,
  onChange,
  country,
  onCountryChange,
  placeholder,
  autoFocus = false,
  maxLength,
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  country: string
  onCountryChange: (iso: string) => void
  placeholder?: string
  autoFocus?: boolean
  maxLength?: number
}) {
  const t = useTranslations()
  const phone = isPhoneLike(value)
  const needsCode = phone && !hasIntlPrefix(value)
  const preview = phone ? withCountry(value, country) : null
  const valid = preview !== null && preview.startsWith('+')
  const hint =
    phone && valid ? `${t('auth_phone_as')} \u2066${formatE164(preview!)}\u2069` : undefined
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
      </label>
      <div dir="ltr" style={{ display: 'flex', gap: 8 }}>
        {needsCode && (
          <CountryCodePicker iso={country} onChange={onCountryChange} disabled={disabled} />
        )}
        <input
          id={id}
          className={error ? 'bt-input bt-input-err' : 'bt-input'}
          type="text"
          inputMode="email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          maxLength={maxLength}
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          dir={phone || value === '' ? 'ltr' : 'auto'}
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/**
 * خانة رقم الجوال (التسجيل والحساب): اختيار الدولة دائماً ظاهر بجانب الرقم،
 * والزائر يكتب رقمه المحلي كما يعرفه (0501234567). تحت الخانة: الرقم الدولي
 * كما سيُحفظ، أو تنبيه إن لم يكن رقماً صحيحاً لتلك الدولة.
 *
 * القيمة المرسلة: `toE164(value, country)`.
 */
export function PhoneField({
  label,
  error,
  disabled = false,
  value,
  onChange,
  country,
  onCountryChange,
  maxLength,
}: BaseProps & {
  value: string
  onChange: (value: string) => void
  country: string
  onCountryChange: (iso: string) => void
  maxLength?: number
}) {
  const t = useTranslations()
  const names = useRegionNames()
  // The "not valid" note waits until the visitor leaves the box, so it does
  // not shout at them while they are still typing.
  const [left, setLeft] = useState(false)
  const e164 = value.trim() === '' ? null : toE164(value, country)
  const hint =
    value.trim() === ''
      ? undefined
      : e164
        ? `${t('auth_phone_as')} \u2066${formatE164(e164)}\u2069`
        : left
          ? t('auth_phone_check', { country: names?.of(country) ?? country })
          : undefined
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
      </label>
      <div dir="ltr" style={{ display: 'flex', gap: 8 }}>
        <CountryCodePicker iso={country} onChange={onCountryChange} disabled={disabled} />
        <input
          id={id}
          className={error ? 'bt-input bt-input-err' : 'bt-input'}
          type="tel"
          inputMode="tel"
          value={value}
          onChange={(event) => {
            // More digits than any mobile number in this country: ignore
            // the keystroke instead of letting a wrong number through.
            const next = event.target.value
            if (isTooLong(next, country)) return
            // Already a complete number and one more digit would break it:
            // the number is full (SA: 9 digits after the 0), stop there.
            if (
              e164 !== null &&
              next.replace(/\D/g, '').length > value.replace(/\D/g, '').length &&
              toE164(next, country) === null
            )
              return
            onChange(next)
            setLeft(false)
          }}
          placeholder={exampleLocal(country)}
          onBlur={() => setLeft(true)}
          autoComplete="tel-national"
          maxLength={maxLength}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          dir="ltr"
          style={{ flex: 1, minWidth: 0 }}
        />
      </div>
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

export type SelectFieldProps = BaseProps & {
  value: string
  onChange: (value: string) => void
  /** Shown as the empty first option. */
  placeholder: string
  options: readonly { value: string; label: string }[]
  autoComplete?: string
}

export function SelectField({
  label,
  error,
  hint,
  disabled = false,
  optionalLabel,
  value,
  onChange,
  placeholder,
  options,
  autoComplete,
}: SelectFieldProps) {
  const { id, errorId, hintId, describedBy } = useFieldIds(error, hint)

  return (
    <div className="bt-field" style={{ marginBottom: 0 }}>
      <label className="bt-flabel" htmlFor={id} style={{ display: 'block' }}>
        {label}
        {optionalLabel !== undefined && (
          <span className="muted" style={{ fontWeight: 600 }}>
            {' '}
            · {optionalLabel}
          </span>
        )}
      </label>
      <select
        id={id}
        className={error ? 'bt-input bt-input-err' : 'bt-input'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldMessage error={error} errorId={errorId} hint={hint} hintId={hintId} />
    </div>
  )
}

/**
 * Form-level failure banner.
 *
 * Separate from the per-field messages: "wrong email or password" belongs to
 * the submission, not to either box, and attaching it to one of them would
 * point the visitor at the wrong field.
 */
export function FormError({ messageKey }: { messageKey: string | null }) {
  const t = useTranslations()
  if (messageKey === null) return null

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: 'var(--danger-soft)',
        border: '1px solid rgba(179, 38, 30, 0.35)',
        color: 'var(--danger)',
        borderRadius: 12,
        padding: '12px 14px',
        fontSize: 14.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <Icon name="cross" size={18} />
      <span>{t(messageKey)}</span>
    </div>
  )
}

/** Success banner. Same shape, palm-green, and announced politely. */
export function FormNotice({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'center',
        background: 'var(--palm-soft)',
        color: 'var(--forest)',
        borderRadius: 12,
        padding: '14px 16px',
        fontSize: 14.5,
        fontWeight: 600,
        lineHeight: 1.5,
      }}
    >
      <Icon name="check" size={18} />
      <span>{children}</span>
    </div>
  )
}
