/**
 * A category's pin look as inline SVG (chips, cards, list rows, the sheet):
 * the same colour and 24×24 line glyph MapLibre draws into the pins.
 */

import type { CSSProperties } from 'react'

import { pinLookFor } from '@/lib/map/pins'

export function PinGlyph({
  categoryKey,
  size = 20,
  className,
}: {
  categoryKey: string | null | undefined
  size?: number
  className?: string
}) {
  const look = pinLookFor(categoryKey)
  return (
    <span
      className={className ? `mx4-glyph ${className}` : 'mx4-glyph'}
      style={{ '--c': look.color, '--s': `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={look.path} />
      </svg>
    </span>
  )
}

/** Canvas pin: coloured teardrop, white ring, white line glyph. */
export function drawPin(
  color: string,
  path: string,
  cssW: number,
  ratio: number,
): { width: number; height: number; data: Uint8ClampedArray } | null {
  const cssH = Math.round(cssW * 1.3)
  const W = Math.round(cssW * ratio)
  const H = Math.round(cssH * ratio)
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')
  if (!g) return null
  g.scale(ratio, ratio)
  const r = cssW / 2 - 2
  const cx = cssW / 2
  const cy = r + 2
  const tipY = cssH - 1.5
  g.shadowColor = 'rgba(0,0,0,0.3)'
  g.shadowBlur = 3
  g.shadowOffsetY = 1
  g.beginPath()
  const a = Math.asin(r / (tipY - cy))
  g.arc(cx, cy, r, Math.PI / 2 + a, Math.PI / 2 - a)
  g.lineTo(cx, tipY)
  g.closePath()
  g.fillStyle = color
  g.fill()
  g.shadowColor = 'transparent'
  g.lineWidth = Math.max(1.5, cssW / 16)
  g.strokeStyle = '#ffffff'
  g.stroke()
  if (typeof Path2D !== 'undefined') {
    const k = (r * 1.15) / 24
    g.save()
    g.translate(cx - 12 * k, cy - 12 * k)
    g.scale(k, k)
    g.strokeStyle = '#ffffff'
    g.lineWidth = 2.2
    g.lineCap = 'round'
    g.lineJoin = 'round'
    g.stroke(new Path2D(path))
    g.restore()
  }
  return { width: W, height: H, data: g.getImageData(0, 0, W, H).data }
}
