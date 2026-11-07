/**
 * A redirect to a path on this site, sent as a relative `Location`.
 *
 * Final QA, Nov 2026: `NextResponse.redirect(new URL(path, request.url))`
 * sent visitors to `https://0.0.0.0:3000/…` in production — behind the proxy
 * the standalone server sees its own bind address as `request.url`'s host.
 * Browsers resolve a relative `Location` against the address they asked
 * for, so no origin is needed at all.
 */
export function localRedirect(
  path: string,
  init: number | { status?: number; headers?: Record<string, string> } = {},
): Response {
  if (!path.startsWith('/') || path.startsWith('//')) {
    throw new Error(`localRedirect: not a site path: ${path}`)
  }
  const options = typeof init === 'number' ? { status: init } : init
  return new Response(null, {
    status: options.status ?? 307,
    headers: { ...options.headers, Location: path },
  })
}
