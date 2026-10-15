/**
 * Coordinates out of whatever an operator pastes: a Google Maps link or a
 * plain "lat, lng" pair. Pure, no network — a shortened link
 * (maps.app.goo.gl/…) carries no coordinates and returns null.
 *
 * Supported, in order of precision:
 *   …/place/…/data=…!3d-8.5069!4d115.2625…   (the dropped pin itself)
 *   …/@-8.5069,115.2625,17z                  (the map centre)
 *   …?q=-8.5069,115.2625 / query= / ll= / destination= / center=
 *   -8.5069, 115.2625   ·   -8.5069 115.2625   ·   (-8.5069,115.2625)
 */

export interface ParsedCoords {
  lat: number
  lon: number
  /** Which form matched — shown to the operator so a map-centre guess is visible as such. */
  source: 'pin' | 'centre' | 'query' | 'pair'
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)'

function valid(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    !(lat === 0 && lon === 0)
  )
}

function pair(a: string | undefined, b: string | undefined, source: ParsedCoords['source']) {
  if (a === undefined || b === undefined) return null
  const lat = Number(a)
  const lon = Number(b)
  return valid(lat, lon) ? { lat, lon, source } : null
}

export function parseCoordinateText(input: string): ParsedCoords | null {
  let text = input.trim()
  if (text === '') return null
  try {
    text = decodeURIComponent(text)
  } catch {
    // keep the raw text
  }

  // !3d<lat>!4d<lng> — Google's own pin; the last pair is the place.
  const pins = [...text.matchAll(new RegExp(`!3d${NUM}!4d${NUM}`, 'g'))]
  const lastPin = pins[pins.length - 1]
  if (lastPin) {
    const found = pair(lastPin[1], lastPin[2], 'pin')
    if (found) return found
  }

  // ?q= / query= / ll= / destination= / center= / daddr=
  const query = text.match(
    new RegExp(`[?&](?:q|query|ll|sll|destination|center|daddr)=(?:loc:)?${NUM}\\s*,\\s*${NUM}`),
  )
  if (query) {
    const found = pair(query[1], query[2], 'query')
    if (found) return found
  }

  // /@<lat>,<lng>,<zoom>z
  const at = text.match(new RegExp(`@${NUM},${NUM}`))
  if (at) {
    const found = pair(at[1], at[2], 'centre')
    if (found) return found
  }

  // A plain pair: "-8.5069, 115.2625", "-8.5069 115.2625", "(-8.5, 115.2)"
  const plain = text.match(new RegExp(`^\\(?\\s*${NUM}\\s*[,;\\s]\\s*${NUM}\\s*\\)?$`))
  if (plain) return pair(plain[1], plain[2], 'pair')

  return null
}
