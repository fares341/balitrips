/**
 * Renders the safe markdown subset (`@/lib/content/markdown`) as React
 * elements. There is no HTML string anywhere — text is text — and links are
 * already restricted by the parser; external ones open in a new tab without
 * passing the page on (`noopener noreferrer`).
 *
 * No 'use client': works in Server and Client Components alike.
 */

import type { ReactNode } from 'react'

import { parseMarkdown, type MdInline } from '@/lib/content/markdown'

function inline(nodes: readonly MdInline[], prefix: string): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${prefix}-${index}`
    switch (node.type) {
      case 'text':
        return <span key={key}>{node.text}</span>
      case 'br':
        return <br key={key} />
      case 'strong':
        return <strong key={key}>{inline(node.children, key)}</strong>
      case 'em':
        return <em key={key}>{inline(node.children, key)}</em>
      case 'link':
        return node.external ? (
          <a key={key} href={node.href} target="_blank" rel="noopener noreferrer nofollow">
            {inline(node.children, key)}
          </a>
        ) : (
          <a key={key} href={node.href}>
            {inline(node.children, key)}
          </a>
        )
    }
  })
}

export function Markdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source)
  if (blocks.length === 0) return null
  return (
    <div className={['md', className].filter(Boolean).join(' ')}>
      {blocks.map((block, index) => {
        const key = `b${index}`
        if (block.type === 'heading') {
          return block.level === 3 ? (
            <h3 key={key}>{inline(block.children, key)}</h3>
          ) : (
            <h4 key={key}>{inline(block.children, key)}</h4>
          )
        }
        if (block.type === 'list') {
          const items = block.items.map((item, i) => (
            <li key={`${key}-${i}`}>{inline(item, `${key}-${i}`)}</li>
          ))
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>
        }
        return <p key={key}>{inline(block.children, key)}</p>
      })}
    </div>
  )
}
