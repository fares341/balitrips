/**
 * Chart geometry — pure, shared by the Studio's React charts and the PDF's
 * HTML. No library: a line chart is two polylines, a few gridlines and some
 * labels, and doing it by hand keeps it light, printable and RTL-aware.
 *
 * Right-to-left: time runs from right to left in Arabic (`rtl: true`), the
 * value axis sits on the right, and text is never mirrored — only positions
 * are computed from the other side.
 */

export interface LineGeometry {
  width: number
  height: number
  plot: { left: number; right: number; top: number; bottom: number }
  current: { x: number; y: number }[]
  previous: { x: number; y: number }[] | null
  ticks: { y: number; value: number }[]
  xLabels: { x: number; text: string }[]
  max: number
}

/** A rounded maximum and 4 evenly spaced ticks starting at 0. */
export function niceTicks(max: number, count = 4): number[] {
  if (!Number.isFinite(max) || max <= 0) return [0, 1]
  const raw = max / count
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw
  const ticks: number[] = []
  for (let value = 0; value <= max + step * 0.0001; value += step) ticks.push(value)
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push((ticks[ticks.length - 1] ?? 0) + step)
  return ticks
}

export function lineGeometry(input: {
  labels: readonly string[]
  current: readonly number[]
  previous: readonly number[] | null
  rtl: boolean
  width?: number
  height?: number
  /** Room for the value labels. */
  axis?: number
}): LineGeometry {
  const width = input.width ?? 720
  const height = input.height ?? 240
  const axis = input.axis ?? 64
  const plot = {
    left: input.rtl ? 12 : axis,
    right: input.rtl ? width - axis : width - 12,
    top: 12,
    bottom: height - 28,
  }
  const n = Math.max(input.current.length, 1)
  const values = [...input.current, ...(input.previous ?? [])]
  const ticks = niceTicks(Math.max(0, ...values))
  const max = ticks[ticks.length - 1] ?? 1
  const xAt = (i: number) => {
    const t = n === 1 ? 0.5 : i / (n - 1)
    const span = plot.right - plot.left
    return input.rtl ? plot.right - t * span : plot.left + t * span
  }
  const yAt = (value: number) =>
    plot.bottom - (max === 0 ? 0 : (value / max) * (plot.bottom - plot.top))
  const points = (series: readonly number[]) =>
    series.slice(0, n).map((value, i) => ({ x: xAt(i), y: yAt(value) }))

  // At most ~7 x labels, always the first and the last.
  const every = Math.max(1, Math.ceil(n / 7))
  const xLabels = input.labels
    .map((text, i) => ({ x: xAt(i), text, i }))
    .filter((label) => label.i % every === 0 || label.i === n - 1)
    .filter((label, idx, list) => {
      // Drop a label that would collide with the last one.
      const last = list[list.length - 1]
      return label === last || !last || Math.abs(label.x - last.x) > 40 || idx === 0
    })
    .map(({ x, text }) => ({ x, text }))

  return {
    width,
    height,
    plot,
    current: points(input.current),
    previous: input.previous ? points(input.previous) : null,
    ticks: ticks.map((value) => ({ value, y: yAt(value) })),
    xLabels,
    max,
  }
}

export function polyline(points: readonly { x: number; y: number }[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}
