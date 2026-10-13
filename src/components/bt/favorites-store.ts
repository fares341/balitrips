'use client'

/**
 * The visitor's favorites, on the client.
 *
 * Pages are cached and never read the session on the server, so the header
 * counter, the account popover and every card heart ask `/api/favorites`
 * once after hydration and share the answer through this tiny store.
 * `useSyncExternalStore` keeps them in step: toggling a heart on a card
 * updates the header counter without a refetch.
 *
 * The server snapshot is "not loaded / signed out / nothing saved", which is
 * also what the first client render sees — no hydration mismatch.
 */

import { useSyncExternalStore } from 'react'

export type FavoritesState = {
  /** False until the first `/api/favorites` answer arrives. */
  loaded: boolean
  signedIn: boolean
  /** `"<kind>:<refId>"` keys. */
  keys: ReadonlySet<string>
}

/** Dispatched on `window` after a favorite changes anywhere on the page. */
export const FAVORITES_CHANGED_EVENT = 'bt:favorites-changed'

const INITIAL: FavoritesState = { loaded: false, signedIn: false, keys: new Set() }

let state: FavoritesState = INITIAL
let inflight: Promise<void> | null = null
let wired = false
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Re-read the favorites from the server (after sign-in, on tab focus …). */
export function refreshFavorites(): Promise<void> {
  if (inflight !== null) return inflight
  inflight = fetch('/api/favorites', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: { signedIn?: boolean; keys?: string[] } | null) => {
      if (body === null) return
      state = {
        loaded: true,
        signedIn: body.signedIn === true,
        keys: new Set(Array.isArray(body.keys) ? body.keys : []),
      }
      emit()
    })
    // A failed request leaves the counters at zero; nothing else depends on it.
    .catch(() => undefined)
    .finally(() => {
      inflight = null
    })
  return inflight
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!wired && typeof window !== 'undefined') {
    wired = true
    void refreshFavorites()
    // Another tab may have saved something while this one was hidden.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void refreshFavorites()
    })
    window.addEventListener(FAVORITES_CHANGED_EVENT, () => void refreshFavorites())
  }
  return () => {
    listeners.delete(listener)
  }
}

export function useFavorites(): FavoritesState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => INITIAL,
  )
}

/** Optimistically record a toggle that the server has just confirmed. */
export function setFavorite(key: string, saved: boolean): void {
  const keys = new Set(state.keys)
  if (saved) keys.add(key)
  else keys.delete(key)
  state = { ...state, loaded: true, signedIn: true, keys }
  emit()
}

export function favoriteKey(kind: string, refId: string): string {
  return `${kind}:${refId}`
}
