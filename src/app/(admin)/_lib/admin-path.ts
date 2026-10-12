/**
 * Where the admin lives.
 *
 * The public path is environment-configured and rotatable without a code
 * change (`ADMIN_BASE_PATH`, default `/studio-8f2a`). Obscurity is the
 * OUTERMOST layer only — it buys nothing on its own and none of the
 * security weight rests on it. The real gate is `requireCapability()`,
 * which runs server-side inside every page and every server action.
 *
 * The App Router needs a literal folder name, and a dynamic first segment
 * would collide with `[locale]`, so the routes physically live under
 * `ADMIN_INTERNAL_MOUNT` and the proxy rewrites the configured base path
 * onto it. The rewrite is invisible to the browser: the address bar keeps
 * showing the configured path.
 */

const DEFAULT_ADMIN_BASE_PATH = '/studio-8f2a'

/**
 * Static mount point inside `src/app/(admin)/`. An implementation detail —
 * the proxy refuses direct requests to it so there is exactly one URL that
 * reaches the admin.
 */
export const ADMIN_INTERNAL_MOUNT = '/studio'

/** Configured public base path, normalised to a leading and no trailing slash. */
export function adminBasePath(): string {
  const raw = process.env.ADMIN_BASE_PATH?.trim()
  if (!raw) return DEFAULT_ADMIN_BASE_PATH

  const withLeading = raw.startsWith('/') ? raw : `/${raw}`
  const normalised = withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading
  return normalised === '' ? DEFAULT_ADMIN_BASE_PATH : normalised
}

/**
 * Build a link or redirect target inside the admin.
 *
 * Always use this rather than writing the segment by hand: the base path is
 * configuration, and a hard-coded `/studio-8f2a` somewhere would break the
 * moment it is rotated.
 */
export function adminHref(path = ''): string {
  const base = adminBasePath()
  if (path === '' || path === '/') return base
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

export function isAdminPath(pathname: string): boolean {
  const base = adminBasePath()
  return pathname === base || pathname.startsWith(`${base}/`)
}

export function isInternalAdminPath(pathname: string): boolean {
  return pathname === ADMIN_INTERNAL_MOUNT || pathname.startsWith(`${ADMIN_INTERNAL_MOUNT}/`)
}

/** Map a public admin path onto the folder the routes actually live in. */
export function toInternalAdminPath(pathname: string): string {
  return `${ADMIN_INTERNAL_MOUNT}${pathname.slice(adminBasePath().length)}`
}

/**
 * Emitted on every admin response.
 *
 * The path is deliberately NOT listed in robots.txt — a Disallow line is a
 * public directory of the things you did not want found. `noindex` on the
 * response keeps it out of indexes without advertising it.
 */
export const ADMIN_ROBOTS_TAG = 'noindex, nofollow, noarchive, nosnippet'

/**
 * Internal marker set on the proxy's own admin rewrite.
 *
 * A rewrite re-enters the proxy on the rewritten path, so the guard that
 * refuses direct requests to the internal mount needs a way to recognise
 * traffic it routed there itself. Inbound requests carrying this header are
 * rejected before it is trusted.
 */
export const ADMIN_REWRITE_HEADER = 'x-bali-admin-rewrite'
