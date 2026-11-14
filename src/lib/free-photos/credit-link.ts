/**
 * The link shown beside a photo credit on /credits, repaired where the stored
 * URL does not open in a browser (site audit, Nov 2026). The credit text
 * itself (photographer, licence, source name) is never changed.
 *
 *  - A trailing «)» or other punctuation swallowed from the credit line
 *    (`…/?cid=123)`) is dropped.
 *  - A Wikimedia Commons file page needs its namespace:
 *    `/wiki/Melasti Beach coast.jpg` is a 404, `/wiki/File:Melasti…` is the page.
 *  - `places.googleapis.com/v1/places/<id>/photos/…` is an API address (400 in
 *    a browser): the link goes to that place on Google Maps instead.
 *
 * Returns null when there is nothing safe to link to (the credit then shows
 * its source as plain text).
 */
export function creditLinkUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  let text = raw.trim()
  // Closing punctuation that belongs to the sentence, not the address. A «)»
  // stays when the URL has its «(» (Commons titles such as `Foo_(Bali).jpg`).
  for (;;) {
    const last = text.slice(-1)
    if (last === ')' && text.split('(').length <= text.split(')').length - 1)
      text = text.slice(0, -1)
    else if (/[.,;:'"»>\]]/.test(last)) text = text.slice(0, -1)
    else break
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  if (url.hostname === 'places.googleapis.com') {
    const match = /^\/v1\/places\/([A-Za-z0-9_-]+)(?:\/|$)/.exec(url.pathname)
    return match ? `https://www.google.com/maps/place/?q=place_id:${match[1]}` : null
  }

  if (url.hostname === 'commons.wikimedia.org' && url.pathname.startsWith('/wiki/')) {
    const title = url.pathname.slice('/wiki/'.length)
    // No namespace (`File:`, `Category:`, `Special:` …) but a media file name.
    if (!/^[^/]*(:|%3A)/i.test(title) && /\.(jpe?g|png|gif|webp|svg|tiff?)$/i.test(title)) {
      url.pathname = `/wiki/File:${title}`
    }
  }
  return url.toString()
}
