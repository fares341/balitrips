/**
 * Safe rendering of assistant replies: "markdown-lite".
 *
 * The model's text is untrusted — a page it read, a user message or a crafted
 * prompt can all steer what it writes. So the reply is never HTML. It is
 * tokenised here into a tiny tree (paragraphs, bullet lists, bold, links) and
 * the client renders that tree as React text nodes, which React escapes.
 *
 * Links are the only way out of the page, and they are allow-listed:
 *
 *   - a path on this site (`/activities/x`, `/en/map?place=y`), never a
 *     protocol-relative `//host` or a backslash trick (`/\host`);
 *   - an absolute URL on this site's own origin (turned into a path);
 *   - Google Maps (`https://www.google.com/maps…`, `https://maps.google.com…`,
 *     `https://maps.app.goo.gl/…`).
 *
 * Anything else — `javascript:`, `data:`, another domain, a mail link — keeps
 * its label and loses the link. Bare URLs in the text are left as text.
 *
 * Pure and dependency-free: imported by the client panel, the Studio panel
 * and the unit tests.
 */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'link'; text: string; href: string; external: boolean }

export type Block = { type: 'p'; parts: Inline[] } | { type: 'ul' | 'ol'; items: Inline[][] }

const MAPS_HOSTS = new Set(['www.google.com', 'google.com', 'maps.google.com'])
const MAX_HREF = 600

/**
 * The link target to use, or null to drop the link.
 *
 * @param origin this site's origin (e.g. `https://balitrips.co`), so an
 *   absolute link to ourselves is kept as a path.
 */
export function sanitizeHref(raw: string, origin?: string | null): string | null {
  const href = raw.trim()
  if (href === '' || href.length > MAX_HREF) return null
  // Control characters and whitespace inside a URL are how filters get fooled.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(href)) return null

  if (href.startsWith('/')) {
    if (href.startsWith('//')) return null
    return href
  }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return null
  }
  if (url.username !== '' || url.password !== '') return null

  if (origin) {
    let own: URL | null = null
    try {
      own = new URL(origin)
    } catch {
      own = null
    }
    if (own !== null && url.origin === own.origin && /^https?:$/.test(url.protocol)) {
      const path = `${url.pathname}${url.search}${url.hash}`
      return path.startsWith('//') ? null : path
    }
  }

  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (MAPS_HOSTS.has(host)) {
    if (host === 'maps.google.com' || url.pathname === '/maps' || url.pathname.startsWith('/maps/'))
      return url.toString()
    return null
  }
  if (host === 'maps.app.goo.gl') return url.toString()
  return null
}

/** True for a link that leaves the site (opened in a new tab). */
export function isExternalHref(href: string): boolean {
  return !href.startsWith('/')
}

/**
 * Same-site path with the visitor's locale prefix: the model writes
 * `/activities/x`, the site serves `/ar/activities/x`.
 */
export function localizePath(href: string, locale: string, locales: readonly string[]): string {
  if (!href.startsWith('/')) return href
  const first = href.split(/[/?#]/)[1] ?? ''
  if (locales.includes(first)) return href
  return href === '/' ? `/${locale}` : `/${locale}${href}`
}

/* --------------------------------------------------------------------------
   Tokeniser
   -------------------------------------------------------------------------- */

const MAX_TEXT = 8000

/** One line of inline markup: `**bold**` and `[label](url)`. */
export function parseInline(line: string, origin?: string | null): Inline[] {
  const out: Inline[] = []
  // A URL may contain one level of balanced parentheses (`…alert(1)`), so a
  // refused link still collapses to exactly its label.
  const pattern =
    /\*\*([^*\n]{1,300}?)\*\*|\[([^\]\n]{1,200})\]\(((?:[^()\s]|\([^()\s]{0,100}\)){1,600})\)/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(line)) !== null) {
    if (match.index > last) push(out, { type: 'text', text: line.slice(last, match.index) })
    if (match[1] !== undefined) {
      push(out, { type: 'bold', text: match[1] })
    } else {
      const label = match[2] ?? ''
      const href = sanitizeHref(match[3] ?? '', origin)
      push(
        out,
        href === null
          ? { type: 'text', text: label }
          : { type: 'link', text: label, href, external: isExternalHref(href) },
      )
    }
    last = match.index + match[0].length
  }
  if (last < line.length) push(out, { type: 'text', text: line.slice(last) })
  return out
}

function push(out: Inline[], part: Inline): void {
  const prev = out[out.length - 1]
  if (part.type === 'text' && prev?.type === 'text') prev.text += part.text
  else if (part.text !== '') out.push(part)
}

/**
 * The whole reply as blocks. Headings (`# x`) degrade to bold paragraphs,
 * code fences to plain text: the panel has no use for either, and a model
 * that emits them should still read cleanly.
 */
export function parseReply(text: string, origin?: string | null): Block[] {
  const blocks: Block[] = []
  const state: { paragraph: string[]; list: { type: 'ul' | 'ol'; items: Inline[][] } | null } = {
    paragraph: [],
    list: null,
  }

  const closeParagraph = () => {
    if (state.paragraph.length > 0) {
      blocks.push({ type: 'p', parts: parseInline(state.paragraph.join(' '), origin) })
      state.paragraph = []
    }
  }
  const closeList = () => {
    if (state.list !== null) {
      blocks.push(state.list)
      state.list = null
    }
  }

  for (const rawLine of text.slice(0, MAX_TEXT).replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('```')) {
      closeParagraph()
      closeList()
      continue
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line)
    const numbered = bullet ? null : /^\d{1,2}[.)]\s+(.*)$/.exec(line)
    const item = bullet ?? numbered
    if (item) {
      closeParagraph()
      const type = bullet ? 'ul' : 'ol'
      if (state.list === null || state.list.type !== type) {
        closeList()
        state.list = { type, items: [] }
      }
      state.list.items.push(parseInline(item[1] ?? '', origin))
      continue
    }
    closeList()
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      closeParagraph()
      blocks.push({ type: 'p', parts: [{ type: 'bold', text: heading[1] ?? '' }] })
      continue
    }
    state.paragraph.push(line)
  }
  closeParagraph()
  closeList()
  return blocks
}
