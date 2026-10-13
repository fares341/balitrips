'use client'

/**
 * The "My Trip" counter: the number of items in the server-owned cart.
 *
 * Read on the client from the non-httpOnly `bt_cart_count` cookie (a display
 * hint the cart mutations keep current) and refreshed on `bt:cart-changed`,
 * on focus and when the tab becomes visible — so the shell stays cacheable.
 * Shared by the header and the mobile tab bar through one external store.
 */

import { useSyncExternalStore } from 'react'

import { CART_CHANGED_EVENT, CART_COUNT_COOKIE } from './routes'

function readCartCount(): number {
  const match = new RegExp(`(?:^|;\\s*)${CART_COUNT_COOKIE}=(\\d+)`).exec(document.cookie)
  const raw = match?.[1]
  if (raw === undefined) return 0
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CART_CHANGED_EVENT, onChange)
  // A second tab may have changed the cart while this one was hidden.
  window.addEventListener('focus', onChange)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    window.removeEventListener(CART_CHANGED_EVENT, onChange)
    window.removeEventListener('focus', onChange)
    document.removeEventListener('visibilitychange', onChange)
  }
}

/** 0 on the server and on the first client render (no hydration mismatch). */
export function useCartCount(): number {
  return useSyncExternalStore(subscribe, readCartCount, () => 0)
}
