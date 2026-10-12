'use client'

/**
 * Modal shell — the dialog behind the auth sheet, the driver upsell and the
 * site search overlay.
 *
 * Ported from `DriverUpsell` / `SearchOverlay` in design/handoff/bt-ui.jsx and
 * the auth sheet in design/handoff/sections-bt/auth.jsx. Those three each
 * reimplemented the shell, and between them they had `role="dialog"`,
 * `aria-modal` and an Escape listener — and nothing else. Specifically, all of
 * the following are new here:
 *
 *  - **Focus trap.** Tab in the handoff walked straight out of the dialog and
 *    into the page behind it, which is still fully interactive underneath the
 *    scrim.
 *  - **Focus move in / restore out.** Focus stayed on whatever opened the
 *    dialog, and after closing there was nowhere sensible to return to.
 *  - **Ref-counted scroll lock.** Each overlay set `document.body.style
 *    .overflow = 'hidden'` and cleared it to `''` on unmount, so closing the
 *    upsell that opened over the search overlay unlocked the body while the
 *    search overlay was still up.
 *  - **Portal.** The handoff rendered in place, so a dialog opened from inside
 *    a `transform`ed card was clipped by that card's stacking context.
 *  - **Scrim click discipline.** The handoff closed on any click that reached
 *    the scrim, including the mouseup of a text selection that started inside
 *    the dialog and ended outside it. Both ends must be on the scrim here.
 *
 * The class names are props because the three call sites use different
 * skins: `.bt-modal-scrim`/`.bt-modal`, `.bt-modal-scrim`/`.bt-upsell` and
 * `.bt-search-scrim`/`.bt-search`.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react'
import type { CSSProperties, MouseEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/ui'

/* --------------------------------------------------------------------------
   Body scroll lock, shared across every open dialog.
   -------------------------------------------------------------------------- */

let lockDepth = 0
let restoreOverflow = ''

function lockScroll() {
  if (lockDepth === 0) {
    restoreOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  lockDepth += 1
}

function unlockScroll() {
  lockDepth = Math.max(0, lockDepth - 1)
  if (lockDepth === 0) {
    document.body.style.overflow = restoreOverflow
    restoreOverflow = ''
  }
}

/* --------------------------------------------------------------------------
   Dialog stack.

   Every open dialog listens on `document` in the capture phase, and
   `stopPropagation` does not stop sibling listeners on the same node — so
   without this, one Escape would close a dialog and everything underneath it.
   Only the top of the stack reacts to keys.
   -------------------------------------------------------------------------- */

const stack: object[] = []

function push(token: object) {
  stack.push(token)
}

function pop(token: object) {
  const index = stack.lastIndexOf(token)
  if (index !== -1) stack.splice(index, 1)
}

function isTopmost(token: object) {
  return stack[stack.length - 1] === token
}

/* --------------------------------------------------------------------------
   Focus trap helpers.
   -------------------------------------------------------------------------- */

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Focusable descendants in tab order.
 *
 * `offsetParent === null` catches `display: none` subtrees; the explicit
 * `hidden` and `aria-hidden` checks catch collapsed accordion panels, which
 * are in the DOM and would otherwise become invisible tab stops.
 */
function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => {
    if (node.hasAttribute('hidden')) return false
    if (node.closest('[aria-hidden="true"]')) return false
    if (node.offsetParent === null && getComputedStyle(node).position !== 'fixed') return false
    return true
  })
}

/* --------------------------------------------------------------------------
   Hydration probe.

   `createPortal` needs `document.body`, which does not exist during the server
   render or the hydration pass. `useSyncExternalStore` with a server snapshot
   of `false` reports "not yet mounted" for exactly those two renders and then
   flips, without the setState-in-effect that a `useState` + `useEffect` pair
   would need.
   -------------------------------------------------------------------------- */

const neverChanges = () => () => {}
const onClient = () => true
const onServer = () => false

/* --------------------------------------------------------------------------
   Component.
   -------------------------------------------------------------------------- */

export type ModalProps = {
  /** Whether the dialog is mounted. Controlled by the caller. */
  open: boolean
  /** Called on Escape, on scrim click, and by the built-in close button. */
  onClose: () => void
  children: ReactNode
  /** Accessible name. Supply this or `labelledBy`. */
  label?: string
  /** Id of the element naming the dialog — usually its heading. */
  labelledBy?: string
  /** Id of the element describing the dialog. */
  describedBy?: string
  /** Element to focus on open. Defaults to the dialog itself. */
  initialFocus?: RefObject<HTMLElement | null>
  /** Render the `.bt-modal-x` close button. Turn off to supply your own. */
  showClose?: boolean
  /** Accessible name for that button. Defaults to the "Close" message. */
  closeLabel?: string
  /** Skin for the backdrop. */
  scrimClassName?: string
  /** Skin for the dialog surface. */
  panelClassName?: string
  panelStyle?: CSSProperties
}

export function Modal({
  open,
  onClose,
  children,
  label,
  labelledBy,
  describedBy,
  initialFocus,
  showClose = true,
  closeLabel,
  scrimClassName = 'bt-modal-scrim',
  panelClassName = 'bt-modal',
  panelStyle,
}: ModalProps) {
  const t = useTranslations()
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimPressed = useRef(false)
  // Stable identity for this dialog's slot in the stack.
  const token = useRef<object>({})

  const mounted = useSyncExternalStore(neverChanges, onClient, onServer)

  // Held in a ref so an inline `onClose={() => …}` at the call site does not
  // re-run the effect below, which would unlock and relock the body and steal
  // focus back to the top of the dialog on every parent render.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open || !mounted) return
    const panel = panelRef.current
    if (!panel) return

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const self = token.current

    push(self)
    lockScroll()
    ;(initialFocus?.current ?? panel).focus({ preventScroll: true })

    const onKeyDown = (event: KeyboardEvent) => {
      // A dialog opened on top of this one owns the keyboard.
      if (!isTopmost(self)) return

      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const nodes = focusableWithin(panel)
      const first = nodes[0]
      const last = nodes[nodes.length - 1]

      // Nothing focusable inside: keep focus on the dialog rather than letting
      // Tab escape to the page underneath.
      if (!first || !last) {
        event.preventDefault()
        panel.focus({ preventScroll: true })
        return
      }

      const active = document.activeElement
      const inside = active instanceof Node && panel.contains(active)

      if (event.shiftKey) {
        if (!inside || active === first || active === panel) {
          event.preventDefault()
          last.focus()
        }
      } else if (!inside || active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    // Capture phase, so a child's own keydown handler cannot swallow Escape.
    document.addEventListener('keydown', onKeyDown, true)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      pop(self)
      unlockScroll()
      // Only restore if the opener is still in the document — it may have been
      // unmounted by the very action that closed the dialog.
      if (opener && opener.isConnected) opener.focus({ preventScroll: true })
    }
  }, [open, mounted, initialFocus])

  if (!open || !mounted) return null

  const onScrimPointerDown = (event: MouseEvent<HTMLDivElement>) => {
    scrimPressed.current = event.target === event.currentTarget
  }

  const onScrimClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && scrimPressed.current) onClose()
    scrimPressed.current = false
  }

  return createPortal(
    <div className={scrimClassName} onMouseDown={onScrimPointerDown} onClick={onScrimClick}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={panelClassName}
        // `.bt-modal` is a grid with no `position`, so an absolutely
        // positioned close button would otherwise resolve against the fixed
        // scrim and land in the corner of the viewport.
        style={{ position: 'relative', ...panelStyle }}
      >
        {showClose && (
          <button
            type="button"
            className="bt-modal-x"
            onClick={onClose}
            aria-label={closeLabel ?? t('acct_close')}
          >
            <Icon name="cross" size={20} />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  )
}
