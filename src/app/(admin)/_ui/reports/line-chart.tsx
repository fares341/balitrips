'use client'

/**
 * Line chart: this period (solid green) against the previous one (dashed
 * grey), aligned day by day. Hand-drawn SVG (no chart library), mirrored for
 * Arabic: time runs right to left and the value axis sits on the right.
 *
 * Hover / touch / arrow keys move a crosshair with both values. Screen
 * readers get the SVG's summary and a real table under "Show as table".
 */

import { useId, useMemo, useState } from 'react'

import { formatMoney, minorUnitExponent } from '@/lib/money'
import { lineGeometry, polyline } from '@/lib/reports/svg'
import type { LineChartBlock } from '@/lib/reports/types'

export function LineChart({
  block,
  intl,
  rtl,
  labels,
  width = 720,
}: {
  width?: number
  block: LineChartBlock
  intl: string
  rtl: boolean
  labels: { showTable: string; period: string; summary: string }
}) {
  const [active, setActive] = useState<number | null>(null)
  const id = useId()
  const g = useMemo(
    () =>
      lineGeometry({
        labels: block.labels,
        current: block.current,
        previous: block.previous,
        rtl,
        width,
      }),
    [block.labels, block.current, block.previous, rtl, width],
  )
  const fmt = (value: number) =>
    block.unit === 'money' && block.currency
      ? formatMoney(value, block.currency, intl)
      : new Intl.NumberFormat(intl).format(value)
  const short = (value: number) =>
    block.unit === 'money' && block.currency
      ? new Intl.NumberFormat(intl, {
          notation: 'compact',
          maximumFractionDigits: 1,
        }).format(value / 10 ** minorUnitExponent(block.currency))
      : new Intl.NumberFormat(intl, { notation: 'compact' }).format(value)

  const n = block.current.length
  const pickIndex = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * g.width
    let best = 0
    let distance = Infinity
    g.current.forEach((point, i) => {
      const d = Math.abs(point.x - x)
      if (d < distance) {
        distance = d
        best = i
      }
    })
    return best
  }

  const totalNow = block.current.reduce((a, b) => a + b, 0)
  const totalPrev = block.previous?.reduce((a, b) => a + b, 0) ?? null
  const summary = `${block.title}: ${block.currentLabel} ${fmt(totalNow)}${
    totalPrev !== null ? `; ${block.previousLabel} ${fmt(totalPrev)}` : ''
  }. ${labels.summary}`
  const axisX = rtl ? g.plot.right + 8 : g.plot.left - 8
  // Geometry is physical (already mirrored for Arabic), so the tooltip uses left/right.
  const point = active === null ? null : g.current[active]
  const tooltipSide =
    point === undefined || point === null ? null : point.x > g.width / 2 ? 'end' : 'start'

  return (
    <div className="rp-line">
      <svg
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="img"
        aria-labelledby={`${id}-desc`}
        tabIndex={0}
        onPointerMove={(event) =>
          setActive(pickIndex(event.clientX, event.currentTarget.getBoundingClientRect()))
        }
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (n === 0) return
          const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
          const back = rtl ? 'ArrowRight' : 'ArrowLeft'
          if (event.key === forward) setActive((i) => Math.min(n - 1, (i ?? -1) + 1))
          else if (event.key === back) setActive((i) => Math.max(0, (i ?? n) - 1))
          else if (event.key === 'Escape') setActive(null)
          else return
          event.preventDefault()
        }}
      >
        <desc id={`${id}-desc`}>{summary}</desc>
        {g.ticks.map((tick) => (
          <g key={tick.value}>
            <line className="rp-grid" x1={g.plot.left} x2={g.plot.right} y1={tick.y} y2={tick.y} />
            <text
              className="rp-axis-text"
              x={axisX}
              y={tick.y + 4}
              textAnchor={rtl ? 'start' : 'end'}
            >
              {short(tick.value)}
            </text>
          </g>
        ))}
        {g.xLabels.map((label) => (
          <text
            key={`${label.x}-${label.text}`}
            className="rp-axis-text"
            x={label.x}
            y={g.height - 6}
            textAnchor="middle"
          >
            {label.text}
          </text>
        ))}
        {g.previous ? <polyline className="rp-prev" points={polyline(g.previous)} /> : null}
        <polyline className="rp-cur" points={polyline(g.current)} />
        {point ? (
          <>
            <line
              className="rp-hover-line"
              x1={point.x}
              x2={point.x}
              y1={g.plot.top}
              y2={g.plot.bottom}
            />
            {g.previous && active !== null && g.previous[active] ? (
              <circle className="rp-dot prev" cx={point.x} cy={g.previous[active].y} r={5} />
            ) : null}
            <circle className="rp-dot cur" cx={point.x} cy={point.y} r={5.5} />
          </>
        ) : null}
      </svg>
      {point && active !== null ? (
        <div
          className="rp-tooltip"
          role="status"
          style={
            tooltipSide === 'end'
              ? { right: `${100 - (point.x / g.width) * 100 + 2}%` }
              : { left: `${(point.x / g.width) * 100 + 2}%` }
          }
        >
          <b>{block.labels[active]}</b>
          <span>
            {block.currentLabel}: {fmt(block.current[active] ?? 0)}
          </span>
          {block.previous ? (
            <>
              <br />
              <span>
                {block.previousLabel}: {fmt(block.previous[active] ?? 0)}
              </span>
            </>
          ) : null}
        </div>
      ) : null}
      <div className="rp-legend">
        <span>
          <span className="rp-swatch" aria-hidden="true" />
          {block.currentLabel}
        </span>
        {block.previous ? (
          <span>
            <span className="rp-swatch prev" aria-hidden="true" />
            {block.previousLabel}
          </span>
        ) : null}
      </div>
      <details className="rp-table-toggle">
        <summary>{labels.showTable}</summary>
        <div className="a-table-wrap">
          <table className="a-table">
            <thead>
              <tr>
                <th>{labels.period}</th>
                <th className="num">{block.currentLabel}</th>
                {block.previous ? <th className="num">{block.previousLabel}</th> : null}
              </tr>
            </thead>
            <tbody>
              {block.labels.map((label, i) => (
                <tr key={`${label}-${i}`}>
                  <td>{label}</td>
                  <td className="num">{fmt(block.current[i] ?? 0)}</td>
                  {block.previous ? <td className="num">{fmt(block.previous[i] ?? 0)}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
