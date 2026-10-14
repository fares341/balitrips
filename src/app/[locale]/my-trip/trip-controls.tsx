'use client'

/**
 * The interactive bits of My Trip: remove (with a confirmation), empty the
 * trip (with a confirmation) and the party-size stepper of a plain activity
 * line. Everything else on the page is rendered on the server.
 *
 * The confirmation is the one kind of popup the v3 design allows: a focus-
 * trapped dialog that closes on Escape, and whose safe choice ("Keep it")
 * holds the initial focus.
 *
 * Every successful mutation fires `bt:cart-changed`, because the header and
 * tab-bar badge only re-read the count cookie on that event.
 */

import { useId, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'

import { CART_CHANGED_EVENT } from '@/components/layout/routes'
import { Modal } from '@/components/shared/modal'
import { Stepper } from '@/components/shared/stepper'
import { useToast } from '@/components/shared/toast'
import { Icon } from '@/components/ui/icon'
import { useRouter } from '@/i18n/routing'

import { clearCartAction, removeItemAction, updateQuantityAction } from './actions'

function announce(): void {
  window.dispatchEvent(new Event(CART_CHANGED_EVENT))
}

function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  text: string
  confirmLabel: string
  onConfirm: () => void
  onClose: () => void
}) {
  const t = useTranslations()
  const titleId = useId()
  const textId = useId()
  const keepRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy={titleId}
      describedBy={textId}
      initialFocus={keepRef}
      scrimClassName="modal-scrim open"
      panelClassName="modal stack trip-confirm"
      showClose={false}
    >
      <h2 className="h3" id={titleId}>
        {title}
      </h2>
      <p className="muted" id={textId}>
        {text}
      </p>
      <div className="row">
        <button type="button" className="btn btn-forest" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button ref={keepRef} type="button" className="btn btn-ghost" onClick={onClose}>
          {t('trip_keep')}
        </button>
      </div>
    </Modal>
  )
}

export function RemoveItemButton({ itemId, name }: { itemId: string; name: string }) {
  const t = useTranslations()
  const router = useRouter()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" size={15} /> {t('ct2_remove')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('trip_rm_t')}
        text={t('trip_rm_b', { name })}
        confirmLabel={t('ct2_remove')}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          startTransition(async () => {
            const result = await removeItemAction(itemId)
            if (!result.ok) {
              toast(t('c_error'), { error: true })
              return
            }
            announce()
            toast(t('trip_removed'))
            router.refresh()
          })
        }}
      />
    </>
  )
}

export function ClearTripButton() {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  return (
    <>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" size={16} /> {t('trip_clear')}
      </button>
      <ConfirmDialog
        open={open}
        title={t('trip_clear_t')}
        text={t('trip_clear_b')}
        confirmLabel={t('trip_clear')}
        onClose={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false)
          startTransition(async () => {
            await clearCartAction()
            announce()
            router.refresh()
          })
        }}
      />
    </>
  )
}

export function QuantityControl({
  itemId,
  quantity,
  max,
}: {
  itemId: string
  quantity: number
  /** Real per-item ceiling from the catalogue; enforced again by `buildQuote`. */
  max: number
}) {
  const t = useTranslations()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Stepper
      value={quantity}
      min={1}
      max={max}
      size="sm"
      label={t('c_guests')}
      decreaseLabel={t('c_qty_dec')}
      increaseLabel={t('c_qty_inc')}
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
