'use client'

/**
 * Quantity stepper.
 *
 * Ported from `Stepper` in design/handoff/bt-ui.jsx and the inline copy in
 * sections-bt/page-cart.jsx.
 *
 * The handoff shipped two of these. The shared one clamped to `max = 30`; the
 * cart rewrote it inline and clamped nothing —
 * `onClick={() => setQty(it.id, (it.qty || 1) + 1)}` — so a guest could hold
 * the plus key and check out with 400 seats on a boat that holds twelve. There
 * is one component now and `max` is enforced in a single `clamp`, on the
 * keyboard path as well as the pointer path.
 *
 * Accessibility, none of which the handoff had:
 *  - the readout is a `spinbutton` with aria-valuemin/max/now and arrow-key
 *    handling, so the control is operable without hitting the tiny buttons;
 *  - the group carries an accessible name;
 *  - the buttons disable at the bounds instead of silently no-op'ing.
 */

import { useFormatter, useTranslations } from 'next-intl'
import type { KeyboardEvent } from 'react'

import { Icon } from '@/components/ui'

export type StepperSize = 'sm' | 'md'

export type StepperProps = {
  /** Current quantity. Controlled — this component holds no state. */
  value: number
  /** Called with the already-clamped next value. Never fires out of range. */
  onChange: (next: number) => void
  /** Lower bound, inclusive. */
  min?: number
  /** Upper bound, inclusive. Omit only when the quantity is genuinely unbounded. */
  max?: number
  /** `sm` is the dense cart-row variant. */
  size?: StepperSize
  /** Accessible name for the group and the readout. Defaults to "Qty". */
  label?: string
  /**
   * Accessible names for the two buttons.
   *
   * There is no message key for "decrease" / "increase" in messages/*.json, so
   * these fall back to the mathematical symbols (U+2212, U+002B) rather than
   * hard-coded English. Pass translated strings once keys exist.
   */
  decreaseLabel?: string
  increaseLabel?: string
  /** Disables both buttons and the spinbutton. */
  disabled?: boolean
  className?: string
}

export function Stepper({
  value,
  onChange,
  min = 1,
  max,
  size = 'md',
  label,
  decreaseLabel = '−',
  increaseLabel = '+',
  disabled = false,
  className,
}: StepperProps) {
  const t = useTranslations()
  const format = useFormatter()

  // A caller that passes max < min would otherwise produce a range no value can
  // satisfy; collapse it to a single allowed value instead of throwing.
  const upper = max === undefined ? Number.MAX_SAFE_INTEGER : Math.max(min, max)
  const clamp = (n: number) => Math.min(upper, Math.max(min, Math.round(n)))

  const atMin = value <= min
  const atMax = value >= upper

  const commit = (next: number) => {
    const clamped = clamp(next)
    if (clamped !== value) onChange(clamped)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (disabled) return

    // The control is a row, and in Arabic that row runs the other way: the
    // plus button sits on the left. Left/Right have to follow what the user
    // sees, or the arrow keys fight the layout. Up/Down are absolute.
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    const up = rtl ? 'ArrowLeft' : 'ArrowRight'
    const down = rtl ? 'ArrowRight' : 'ArrowLeft'
    const key = event.key

    let next: number | null = null
    if (key === 'ArrowUp' || key === up) next = value + 1
    else if (key === 'ArrowDown' || key === down) next = value - 1
    else if (key === 'PageUp') next = value + 5
    else if (key === 'PageDown') next = value - 5
    else if (key === 'Home') next = min
    // End is meaningless when unbounded — it would jump to MAX_SAFE_INTEGER.
    else if (key === 'End' && max !== undefined) next = upper

    if (next === null) return
    event.preventDefault()
    commit(next)
  }

  const groupLabel = label ?? t('cart_qty')
  const iconSize = size === 'sm' ? 13 : 16

  return (
    <div
      className={['bt-stepper', size === 'sm' ? 'bt-stepper-sm' : null, className]
        .filter(Boolean)
        .join(' ')}
      role="group"
      aria-label={groupLabel}
    >
      <button
        type="button"
        onClick={() => commit(value - 1)}
        disabled={disabled || atMin}
        aria-label={decreaseLabel}
      >
        <Icon name="minus" size={iconSize} />
      </button>

      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={groupLabel}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max === undefined ? undefined : upper}
        aria-valuetext={format.number(value)}
        aria-disabled={disabled || undefined}
        onKeyDown={onKeyDown}
      >
        {format.number(value)}
      </span>

      <button
        type="button"
        onClick={() => commit(value + 1)}
        disabled={disabled || atMax}
        aria-label={increaseLabel}
      >
        <Icon name="plus" size={iconSize} />
      </button>
    </div>
  )
}
