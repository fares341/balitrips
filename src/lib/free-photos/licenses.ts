/**
 * Licence filter for free place photos (Wikimedia Commons, Openverse).
 *
 * Only four kinds are accepted, all of which allow commercial use, copying
 * and re-hosting as long as the credit is kept:
 *   cc0    CC0 (public-domain dedication)
 *   pd     public domain / Public Domain Mark
 *   by     CC BY (attribution)
 *   by-sa  CC BY-SA (attribution, share-alike)
 * Everything else is refused: NC (non-commercial), ND (no derivatives — our
 * pipeline re-encodes and crops), GFDL-only, fair use, «all rights reserved»,
 * and anything we cannot read with confidence.
 *
 * Pure and client-safe.
 */

export type FreeLicenseKind = 'cc0' | 'pd' | 'by' | 'by-sa'

export interface FreeLicense {
  kind: FreeLicenseKind
  /** «4.0», «2.0»… when known. */
  version: string | null
  /** Short human label, e.g. «CC BY-SA 4.0». */
  label: string
  /** The licence deed. */
  url: string
}

const REFUSE =
  /(^|[^a-z])(nc|nd)([^a-z]|$)|non-?commercial|no-?deriv|fair[ -]?use|all rights reserved|copyrighted|non-?free|gfdl-only|unknown/

function versionOf(text: string): string | null {
  const m = /(\d)\.(\d)/.exec(text)
  return m ? `${m[1]}.${m[2]}` : null
}

function deed(kind: FreeLicenseKind, version: string | null): string {
  if (kind === 'cc0') return 'https://creativecommons.org/publicdomain/zero/1.0/'
  if (kind === 'pd') return 'https://creativecommons.org/publicdomain/mark/1.0/'
  return `https://creativecommons.org/licenses/${kind}/${version ?? '4.0'}/`
}

function labelOf(kind: FreeLicenseKind, version: string | null): string {
  if (kind === 'cc0') return 'CC0'
  if (kind === 'pd') return 'Public domain'
  const base = kind === 'by' ? 'CC BY' : 'CC BY-SA'
  return version ? `${base} ${version}` : base
}

function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  const url = raw.trim().replace(/^\/\//, 'https://')
  return /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url.replace(/^http:/i, 'https:') : null
}

/**
 * Reads a licence from whatever the source gives: a machine code
 * («cc-by-sa-4.0», «by-sa», «pdm»), a short name («CC BY 2.0», «Public
 * domain») and optionally a URL. Returns null for anything not accepted.
 */
export function normalizeLicense(input: {
  code?: string | null
  name?: string | null
  version?: string | null
  url?: string | null
}): FreeLicense | null {
  const code = (input.code ?? '').trim().toLowerCase()
  const name = (input.name ?? '').trim().toLowerCase()
  const url = (input.url ?? '').trim().toLowerCase()
  const text = `${code} | ${name}`
  if (code === '' && name === '' && url === '') return null
  if (REFUSE.test(text) || /\/(by-nc|by-nd|by-nc-sa|by-nc-nd)\//.test(url)) return null
  // A GFDL file is only acceptable when it is dual-licensed with CC.
  if (/gfdl/.test(text) && !/cc|creative/.test(text)) return null

  let kind: FreeLicenseKind | null = null
  if (/cc0|cc-zero|creative commons zero|publicdomain\/zero/.test(`${text} ${url}`)) kind = 'cc0'
  else if (
    /(^|[^a-z])(pd|pdm)([^a-z]|$)|^pd-|public ?domain|publicdomain\/mark/.test(`${text} ${url}`)
  )
    kind = 'pd'
  else if (/by-sa|by sa|attribution-sharealike|licenses\/by-sa\//.test(`${text} ${url}`))
    kind = 'by-sa'
  else if (/(^|[^a-z])(cc[- ])?by([^a-z-]|-\d|$)|licenses\/by\//.test(`${text} ${url}`)) kind = 'by'
  if (kind === null) return null

  const version =
    kind === 'cc0' || kind === 'pd'
      ? null
      : ((input.version?.trim() || null) ?? versionOf(`${code} ${name} ${url}`))
  return {
    kind,
    version,
    label: labelOf(kind, version),
    url: safeUrl(input.url) ?? deed(kind, version),
  }
}

/** Accepted Openverse `license` filter values (pdm = Public Domain Mark). */
export const OPENVERSE_LICENSES = 'cc0,pdm,by,by-sa'
