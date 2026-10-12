'use client'

/**
 * The two interactive controls on a cart line.
 *
 * Everything else on the page renders on the server; these are the only
 * client boundaries, and they are deliberately small — a stepper and a remove
 * button, each wrapping one Server Action.
 *
 * Three things the handoff did not do:
 *
 *  1. **The stepper has a maximum.** The prototype rewrote the shared stepper
 *     inline in the cart with `setQty(it.id, (it.qty || 1) + 1)` and clamped
 *     nothing, so a guest could hold the plus key and check out with 400 seats
 *     on a boat that holds twelve. `max` comes from `activities.max_guests`
 *     and is enforced again server-side in `buildQuote`.
 *  2. **The controls disable while the mutation is in flight.** Otherwise a
 *     double-click fires two updates and the second overwrites the first with
 *     a value computed from stale state.
 *  3. **The header badge is told.** Cart mutations rewrite `bt_cart_count`
 *     server-side; the header only re-reads it on `bt:cart-changed`, so the
 *     event is dispatched here after every successful action.
 */

import { useTransition } from 'react'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { Stepper } from '@/components/shared'
import { Icon } from '@/components/ui'
import { useRouter } from '@/i18n/routing'

import { removeItemAction, updateQuantityAction } from './actions'

function announce(): void {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT))
}

export type QuantityControlProps = {
  itemId: string
  quantity: number
  /** Real per-item ceiling from the catalogue. Never undefined here. */
  max: number
  label: string
  decreaseLabel: string
  increaseLabel: string
}

export function QuantityControl({
  itemId,
  quantity,
  max,
  label,
  decreaseLabel,
  increaseLabel,
}: QuantityControlProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Stepper
      value={quantity}
      min={1}
      max={max}
      size="sm"
      label={label}
      decreaseLabel={decreaseLabel}
      increaseLabel={increaseLabel}
      disabled={pending}
      onChange={(next) => {
        startTransition(async () => {
          await updateQuantityAction(itemId, next)
          announce()
          router.refresh()
        })
      }}
    />
  )
}

export type RemoveButtonProps = {
  itemId: string
  label: string
}

export function RemoveButton({ itemId, label }: RemoveButtonProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      className="bt-cart-remove"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          await removeItemAction(itemId)
          announce()
          router.refresh()
        })
      }}
    >
      <Icon name="trash" size={14} /> {label}
    </button>
  )
}
