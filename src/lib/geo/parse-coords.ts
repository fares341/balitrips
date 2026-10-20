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
 *   8°30'24.8"S 115°15'45.0"E   ·   S 8° 30.41' E 115° 15.75'   ·   8.5069° S, 115.2625° E
 *     (degrees–minutes–seconds, as Google Maps shows a dropped pin)
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

/**
 * Arabic-Indic (٠–٩) and Persian (۰–۹) digits to ASCII, the Arabic decimal
 * separator (٫) to ".", the Arabic comma (،) to "," and a typographic minus
 * (−) to "-", so "-٨٫٥٠٦٩، ١١٥٫٢٦٢٥" reads like "-8.5069, 115.2625".
 */
export function normalizeDigits(input: string): string {
  return input
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\u066b/g, '.')
    .replace(/[\u060c\u066c]/g, ',')
    .replace(/\u2212/g, '-')
}

export function parseCoordinateText(input: string): ParsedCoords | null {
  let text = normalizeDigits(input).trim()
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

  return parseDms(text)
}

/* --------------------------------------------------------------------------
   Degrees, minutes, seconds
   -------------------------------------------------------------------------- */

const DMS_PART =
  /(-?\d{1,3}(?:\.\d+)?)\s*°\s*(?:(\d{1,2}(?:\.\d+)?)\s*'\s*)?(?:(\d{1,2}(?:\.\d+)?)\s*"\s*)?/g

/** What may stand between and around the two parts: separators and one hemisphere letter. */
function hemisphere(segment: string): string | null | false {
  const rest = segment.replace(/[\s,;()]/g, '')
  if (rest === '') return null
  return /^[NSEWnsew]$/.test(rest) ? rest.toUpperCase() : false
}

function dmsValue(match: RegExpMatchArray, hemi: string | null): number | null {
  const [, deg = '', min, sec] = match
  const minutes = min === undefined ? 0 : Number(min)
  const seconds = sec === undefined ? 0 : Number(sec)
  if (minutes >= 60 || seconds >= 60) return null
  // Decimal minutes followed by seconds make no sense.
  if (sec !== undefined && min?.includes('.')) return null
  const negative = deg.startsWith('-')
  if (negative && (hemi === 'S' || hemi === 'W')) return null
  const value = Math.abs(Number(deg)) + minutes / 60 + seconds / 3600
  return negative || hemi === 'S' || hemi === 'W' ? -value : value
}

const axisOf = (hemi: string | null) =>
  hemi === 'N' || hemi === 'S' ? 'lat' : hemi === 'E' || hemi === 'W' ? 'lon' : null

/**
 * `8°30'24.8"S 115°15'45.0"E` and its spellings: typographic primes (′ ″),
 * two apostrophes for seconds, the hemisphere letter before or after, decimal
 * minutes, or decimal degrees with a letter. With letters the order does not
 * matter; without, it is latitude first. Exactly two parts, nothing else.
 */
export function parseDms(input: string): ParsedCoords | null {
  const text = input
    .replace(/[′’‘´`]/g, "'")
    .replace(/[″“”]|''/g, '"')
    .replace(/[º˚]/g, '°')
    .trim()
  if (!text.includes('°')) return null
  const matches = [...text.matchAll(DMS_PART)]
  const [first, second] = matches
  if (matches.length !== 2 || !first || !second) return null
  const firstEnd = (first.index ?? 0) + first[0].length
  const secondEnd = (second.index ?? 0) + second[0].length
  const pre = hemisphere(text.slice(0, first.index ?? 0))
  const mid = hemisphere(text.slice(firstEnd, second.index ?? 0))
  const post = hemisphere(text.slice(secondEnd))
  if (pre === false || mid === false || post === false) return null
  // A letter in front of the first part means letters come first ("S 8° E 115°").
  if (pre !== null && post !== null) return null
  const hemiA = pre ?? mid
  const hemiB = pre !== null ? mid : post
  const a = dmsValue(first, hemiA)
  const b = dmsValue(second, hemiB)
  if (a === null || b === null) return null
  const axisA = axisOf(hemiA)
  const axisB = axisOf(hemiB)
  if (axisA !== null && axisA === axisB) return null
  const latFirst = axisA === 'lat' || axisB === 'lon' || (axisA === null && axisB === null)
  const [lat, lon] = latFirst ? [a, b] : [b, a]
  const rounded = (n: number) => Math.round(n * 1e6) / 1e6
  return valid(lat, lon) ? { lat: rounded(lat), lon: rounded(lon), source: 'pair' } : null
}
