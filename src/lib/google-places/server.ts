import 'server-only'

import { createGoogleClient, type GoogleClient, type GooglePhoto } from './client'
import { googleApiKey, googleBaseUrl } from './config'
import { takeGoogleCall } from './usage'

/**
 * The app's Google client (null when no key is configured).
 *
 * Photo lists are NOT cached: Places policy says a photo name cannot be
 * cached and may expire. The only sharing is in-flight de-duplication —
 * concurrent requests for the same place wait for the one call already on its
 * way and the entry is dropped the moment it settles. Place Details with the
 * `photos` field alone is the no-charge "IDs Only" SKU, so asking per request
 * costs nothing.
 */
export function googleClient(): GoogleClient | null {
  const key = googleApiKey()
  if (key === null) return null
  return createGoogleClient({
    key,
    base: googleBaseUrl(),
    fetch: globalThis.fetch,
    take: takeGoogleCall,
  })
}

const inFlight = new Map<string, Promise<GooglePhoto[]>>()

export function livePlacePhotos(placeId: string): Promise<GooglePhoto[]> {
  const client = googleClient()
  if (client === null) return Promise.resolve([])
  const pending = inFlight.get(placeId)
  if (pending) return pending
  const promise = client.placePhotos(placeId).finally(() => inFlight.delete(placeId))
  inFlight.set(placeId, promise)
  return promise
}
