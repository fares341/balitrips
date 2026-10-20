/**
 * A small, safe markdown subset for activity descriptions written in the
 * Studio: headings, paragraphs, bulleted and numbered lists, **bold**,
 * *italic* and [links](https://…). Nothing else.
 *
 * It parses to a plain tree that the renderer turns into React elements, so
 * there is no HTML string anywhere: `<script>` typed by anyone is shown as the
 * text `<script>`, never run. Links keep only http(s), mailto, tel, site paths
 * (`/…`) and in-page anchors (`#…`); anything else (javascript:, data:, …)
 * loses the link and keeps its text.
 *
 * Pure and dependency-free (server, client and tests).
 */

export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'link'; href: string; external: boolean; children: MdInline[] }
  | { type: 'br' }

export type MdBlock =
  | { type: 'heading'; level: 3 | 4; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'list'; ordered: boolean; items: MdInline[][] }

const MAX_DEPTH = 6
const MAX_SOURCE = 20_000

const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d{1,3}[.)]\s+(.*)$/

/** Parse the subset into blocks. Never throws. */
export function parseMarkdown(source: string | null | undefined): MdBlock[] {
  if (typeof source !== 'string') return []
  const lines = source.slice(0, MAX_SOURCE).replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const children: MdInline[] = []
    paragraph.forEach((line, index) => {
      if (index > 0) children.push({ type: 'br' })
      children.push(...parseInline(line))
    })
    blocks.push({ type: 'paragraph', children })
    paragraph = []
  }
  const flushList = () => {
    if (list === null) return
    blocks.push({
      type: 'list',
      ordered: list.ordered,
      items: list.items.map((item) => parseInline(item)),
    })
    list = null
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.trim() === '') {
      flushParagraph()
      flushList()
      continue
    }
    const heading = HEADING.exec(line.trim())
    if (heading) {
      flushParagraph()
      flushList()
      const text = (heading[2] ?? '').replace(/\s+#+\s*$/, '').trim()
      if (text !== '') {
        blocks.push({
          type: 'heading',
          level: (heading[1] ?? '#').length >= 3 ? 4 : 3,
          children: parseInline(text),
        })
      }
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    if (bullet || numbered) {
      flushParagraph()
      const ordered = numbered !== null
      const text = ((bullet ?? numbered)?.[1] ?? '').trim()
      if (list !== null && list.ordered !== ordered) flushList()
      if (list === null) list = { ordered, items: [] }
      if (text !== '') list.items.push(text)
      continue
    }
    // A line under a list item without a marker continues that item.
    if (list !== null && /^\s{2,}\S/.test(raw) && list.items.length > 0) {
      const last = list.items.length - 1
      list.items[last] = `${list.items[last] ?? ''} ${line.trim()}`
      continue
    }
    flushList()
    paragraph.push(line.trim())
  }
  flushParagraph()
  flushList()
  return blocks.filter((block) => block.type !== 'list' || block.items.length > 0)
}

/** Allowed link targets; null = not a link. */
export function safeHref(raw: string): { href: string; external: boolean } | null {
  // Control characters and whitespace are dropped before the scheme is read:
  // browsers ignore them, so "java\tscript:" must not get through.
  let href = ''
  for (const char of raw) {
    const code = char.codePointAt(0) ?? 0
    if (code > 0x20 && (code < 0x7f || code > 0x9f)) href += char
  }
  if (href === '') return null
  if (href.startsWith('#')) return { href, external: false }
  if (href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/\\')) {
    return { href, external: false }
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase()
  if (scheme === 'http' || scheme === 'https') {
    try {
      const url = new URL(href)
      return { href: url.toString(), external: true }
    } catch {
      return null
    }
  }
  if (scheme === 'mailto' || scheme === 'tel') return { href, external: true }
  return null
}

function isWordChar(char: string | undefined): boolean {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char)
}

/** Inline markup of one line. */
export function parseInline(text: string, depth = 0): MdInline[] {
  const out: MdInline[] = []
  let buffer = ''
  const push = () => {
    if (buffer === '') return
    const last = out[out.length - 1]
    if (last && last.type === 'text') last.text += buffer
    else out.push({ type: 'text', text: buffer })
    buffer = ''
  }

  if (depth > MAX_DEPTH) return [{ type: 'text', text }]

  let i = 0
  while (i < text.length) {
    const char = text[i] ?? ''
    const next = text[i + 1]

    // Backslash escapes a markup character.
    if (char === '\\' && next !== undefined && /[\\*_[\]()#-]/.test(next)) {
      buffer += next
      i += 2
      continue
    }

    // **bold** / __bold__
    if ((char === '*' || char === '_') && next === char) {
      const marker = char + char
      const end = text.indexOf(marker, i + 2)
      const inner = end > i + 2 ? text.slice(i + 2, end) : ''
      if (inner.trim() !== '' && (char === '*' || !isWordChar(text[i - 1]))) {
        push()
        out.push({ type: 'strong', children: parseInline(inner, depth + 1) })
        i = end + 2
        continue
      }
    }

    // *italic* / _italic_
    if ((char === '*' || char === '_') && next !== char && next !== undefined && next !== ' ') {
      let end = -1
      for (let j = i + 1; j < text.length; j++) {
        if (text[j] === char && text[j + 1] !== char && text[j - 1] !== ' ') {
          if (char === '_' && isWordChar(text[j + 1])) continue
          end = j
          break
        }
      }
      if (end > i + 1 && (char === '*' || !isWordChar(text[i - 1]))) {
        push()
        out.push({ type: 'em', children: parseInline(text.slice(i + 1, end), depth + 1) })
        i = end + 1
        continue
      }
    }

    // [label](href)
    if (char === '[') {
      const close = text.indexOf('](', i + 1)
      const end = close === -1 ? -1 : text.indexOf(')', close + 2)
      if (close > i + 1 && end > close + 2) {
        const label = text.slice(i + 1, close)
        const target = safeHref(text.slice(close + 2, end))
        push()
        const children = parseInline(label, depth + 1)
        if (target) out.push({ type: 'link', ...target, children })
        else out.push(...children)
        i = end + 1
        continue
      }
    }

    buffer += char
    i += 1
  }
  push()
  return out
}

function inlineText(nodes: readonly MdInline[]): string {
  return nodes
    .map((node) =>
      node.type === 'text' ? node.text : node.type === 'br' ? ' ' : inlineText(node.children),
    )
    .join('')
}

/** The text without markup, e.g. to cut a card line from a description. */
export function markdownToPlain(source: string | null | undefined): string {
  return parseMarkdown(source)
    .map((block) =>
      block.type === 'list'
        ? block.items.map((item) => inlineText(item)).join(' · ')
        : inlineText(block.children),
    )
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
