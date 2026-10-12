'use client'

/**
 * The two buttons on a saved-place card.
 *
 * In the handoff both were `<button className="btn">` with no `onClick` — the
 * favorites grid was a hard-coded array of four places, so there was nothing
 * for either of them to act on. Here each is a real form posting to a Server
 * Action that re-authenticates and re-checks ownership.
 *
 * Two behaviours worth naming:
 *
 *  - **The header badge is told.** `addItem` rewrites `bt_cart_count`
 *    server-side; the badge only re-reads it on `bt:cart-changed`, so without
 *    the dispatch the count would be stale until the next full navigation.
 *  - **Remove is not optimistic.** A place that failed to disappear because
 *    the request failed is better than one that disappears and comes back on
 *    the next render.
 */

import { useActionState, useEffect } from 'react'
import { useTranslations } from 'next-intl'

import { Button, useToast } from '@/components/shared'
import { CART_CHANGED_EVENT } from '@/components/layout/routes'

import { IDLE_FAVORITE_STATE } from '../_lib/contract'
import { addFavoriteToTripAction, removeFavoriteAction } from '../actions'

export type FavoriteControlsProps = {
  kind: string
  refId: string
  /** False when the row behind the favorite is gone; only Remove is offered. */
  available: boolean
}

export function FavoriteControls({ kind, refId, available }: FavoriteControlsProps) {
  const t = useTranslations()
  const { toast } = useToast()

  const [addState, addAction, adding] = useActionState(addFavoriteToTripAction, IDLE_FAVORITE_STATE)
  const [removeState, removeAction, removing] = useActionState(
    removeFavoriteAction,
    IDLE_FAVORITE_STATE,
  )

  useEffect(() => {
    if (addState.status !== 'added' || addState.refId !== refId) return
    window.dispatchEvent(new Event(CART_CHANGED_EVENT))
    toast(t('cart_added'))
  }, [addState, refId, toast, t])

  useEffect(() => {
    if (removeState.status !== 'error') return
    toast(t('c_error'))
  }, [removeState, toast, t])

  const busy = adding || removing

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      {available && (
        <form action={addAction} style={{ flex: 1 }}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="refId" value={refId} />
          <Button
            type="submit"
            variant="orange"
            size="sm"
            block
            disabled={busy}
            style={{ fontSize: 13, paddingInline: 10 }}
          >
            {adding ? t('auth_working') : t('acct_fav_addtrip')}
          </Button>
        </form>
      )}

      <form action={removeAction}>
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="refId" value={refId} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={busy}
          style={{ fontSize: 13, paddingInline: 12 }}
        >
          {removing ? t('auth_working') : t('acct_fav_remove')}
        </Button>
      </form>
    </div>
  )
}
