/**
 * Site search.
 *
 * `SearchOverlay` is controlled — pass `open` and `onClose` — so it can be
 * mounted from a header trigger without that trigger owning any of the search
 * behaviour. `SearchPageOverlay` is the same dialog wired to the `/search`
 * route, which is what the header's control links to today.
 *
 * Both carry 'use client'; importing either from a Server Component pulls the
 * overlay into that page's bundle. The data they read comes from
 * `/api/search`, so nothing here touches the database.
 */

export { SearchOverlay, SearchPageOverlay } from './search-overlay'
export type { SearchOverlayProps, SearchPageOverlayProps } from './search-overlay'
