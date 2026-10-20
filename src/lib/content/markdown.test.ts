import { describe, expect, it } from 'vitest'

import { markdownToPlain, parseInline, parseMarkdown, safeHref, type MdInline } from './markdown'

/** Every href anywhere in the tree. */
function hrefs(nodes: readonly MdInline[]): string[] {
  return nodes.flatMap((node) =>
    node.type === 'link'
      ? [node.href, ...hrefs(node.children)]
      : node.type === 'strong' || node.type === 'em'
        ? hrefs(node.children)
        : [],
  )
}

function allInline(source: string): MdInline[] {
  return parseMarkdown(source).flatMap((block) =>
    block.type === 'list' ? block.items.flat() : block.children,
  )
}

describe('markdown subset — structure', () => {
  it('headings, paragraphs and both list kinds', () => {
    const blocks = parseMarkdown('## Plan\nFirst line\nsecond line\n\n- one\n- two\n\n1. a\n2) b')
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list'])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 3 })
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      children: [
        { type: 'text', text: 'First line' },
        { type: 'br' },
        { type: 'text', text: 'second line' },
      ],
    })
    expect(blocks[2]).toMatchObject({ type: 'list', ordered: false })
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true })
  })

  it('bold, italic and nesting', () => {
    expect(parseInline('a **b *c* d** e')).toEqual([
      { type: 'text', text: 'a ' },
      {
        type: 'strong',
        children: [
          { type: 'text', text: 'b ' },
          { type: 'em', children: [{ type: 'text', text: 'c' }] },
          { type: 'text', text: ' d' },
        ],
      },
      { type: 'text', text: ' e' },
    ])
    expect(parseInline('_x_')).toEqual([{ type: 'em', children: [{ type: 'text', text: 'x' }] }])
  })

  it('leaves snake_case and lone stars as text', () => {
    expect(parseInline('snake_case_word 2 * 3')).toEqual([
      { type: 'text', text: 'snake_case_word 2 * 3' },
    ])
  })

  it('handles Arabic text and empty input', () => {
    expect(markdownToPlain('### عنوان\nنص **مهم** هنا')).toBe('عنوان نص مهم هنا')
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown(null)).toEqual([])
  })
})

describe('markdown subset — sanitising', () => {
  it('raw HTML stays text: there is no element node type to smuggle it into', () => {
    const nodes = allInline('<script>alert(1)</script> <img src=x onerror=alert(1)> <b>x</b>')
    expect(nodes.every((n) => n.type === 'text')).toBe(true)
    expect(markdownToPlain('<script>alert(1)</script>')).toBe('<script>alert(1)</script>')
  })

  it('keeps safe links', () => {
    expect(
      hrefs(allInline('[a](https://example.com/x) [b](/ar/map) [c](mailto:x@y.z) [d](#faq)')),
    ).toEqual(['https://example.com/x', '/ar/map', 'mailto:x@y.z', '#faq'])
  })

  it('drops dangerous links but keeps their text', () => {
    for (const target of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'java\tscript:alert(1)',
      ' javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:x',
      '//evil.example',
      '/\\evil.example',
    ]) {
      const nodes = allInline(`[click](${target})`)
      expect(hrefs(nodes)).toEqual([])
      expect(markdownToPlain(`[click](${target})`)).toContain('click')
    }
    expect(safeHref('file:///etc/passwd')).toBeNull()
  })

  it('external links are marked external', () => {
    expect(safeHref('https://maps.google.com')).toEqual({
      href: 'https://maps.google.com/',
      external: true,
    })
    expect(safeHref('/activities')).toEqual({ href: '/activities', external: false })
  })

  it('caps nesting depth and source length', () => {
    const deep = `${'**'.repeat(40)}x${'**'.repeat(40)}`
    expect(() => parseInline(deep)).not.toThrow()
    expect(() => parseMarkdown('a'.repeat(100_000))).not.toThrow()
  })
})
