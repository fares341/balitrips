/**
 * Motion for the home hero's "living map", without an animation library.
 *
 * The Web Animations API (`element.animate`) for CSS transforms, opacity and
 * stroke dashes, and a small requestAnimationFrame tween for the values CSS
 * cannot animate (SVG attributes, the reveal mask radius).
 *
 * The brief is "beautiful but calm": one short, unhurried opening (about
 * 3.5s, gentle in-out curves, nothing that overshoots), then a slow,
 * quiet slider. Stages:
 *   1. clouds drift apart over the night (blueprint) map — pure CSS
 *      (hero.css), so it starts at first paint instead of waiting for
 *      hydration
 *   2. a thin, faint coastline is traced once
 *   3. a soft radial fade from Ubud uncovers the colour map
 *   4. pins fade in; the route is drawn once, then rests at low opacity
 *   5. the headline and copy fade up
 *   6. a light vignette around the active pin, then the destination slider
 *      (card crossfade, leader line fade, one slow breathing ring)
 * Ambient: a few dim sun glints on the water (canvas) and two or three very
 * slow cloud wisps. The photo itself is never scaled, moved or blurred —
 * only masks and vector overlays animate over it.
 *
 * Everything is imperative and owned by this module: React renders the markup
 * once, the engine animates it, and `destroy()` undoes every timer, frame,
 * observer, listener and animation it started.
 */

import { MAP_H, MAP_W } from './living-map-data'

/** What the card shows; pushed to React, which renders the card's content. */
export interface SlideState {
  /** Destination whose pin is highlighted (switches immediately). */
  active: number
  /** Destination the card shows (switches mid-transition). */
  shown: number
  /** Position of `shown` among the destinations visible at this size. */
  pos: number
  total: number
}

export interface LivingMapEngine {
  destroy(): void
  setUserPaused(paused: boolean): void
  /** Previous / next, as the nav buttons do. */
  step(delta: number): void
  /** A pin was clicked. */
  goToPoint(index: number): void
}

interface Options {
  root: HTMLElement
  points: readonly { x: number; y: number }[]
  reduce: boolean
  onSlide(state: SlideState): void
}

/** Milliseconds each destination stays up. */
const INTERVAL = 8000
/** Mobile layout below this hero width (matches hero.css). */
const MOBILE_MAX = 820
/** Phase B (the colour reveal) starts here, or once the map is decoded… */
const REVEAL_AT = 1000
/** …but waits no longer than this past REVEAL_AT for a slow image. */
const DECODE_GRACE = 1200
/** The no-JS failsafe in hero.css starts revealing at 3s. Hydrating later
    than this means the visitor has watched the clouds long enough. */
const LATE_HYDRATION = 2400

// ---------------------------------------------------------------------------
// Easing: gentle curves only (no back/elastic overshoot), as functions for
// rAF tweens and as CSS for WAAPI
// ---------------------------------------------------------------------------

type Ease = (t: number) => number

const EASE = {
  linear: (t: number) => t,
  sineOut: (t: number) => Math.sin((t * Math.PI) / 2),
  sineInOut: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  quadOut: (t: number) => 1 - (1 - t) * (1 - t),
  cubicOut: (t: number) => 1 - (1 - t) ** 3,
} satisfies Record<string, Ease>

type EaseName = keyof typeof EASE

/** Closest cubic-bezier, for engines without CSS `linear()`. */
const BEZIER: Record<EaseName, string> = {
  linear: 'linear',
  sineOut: 'cubic-bezier(0.61, 1, 0.88, 1)',
  sineInOut: 'cubic-bezier(0.37, 0, 0.63, 1)',
  quadOut: 'cubic-bezier(0.5, 1, 0.89, 1)',
  cubicOut: 'cubic-bezier(0.33, 1, 0.68, 1)',
}

function cssEasings(): Record<EaseName, string> {
  const exact =
    typeof CSS !== 'undefined' && CSS.supports('animation-timing-function', 'linear(0, 1)')
  if (!exact) return BEZIER
  const out = {} as Record<EaseName, string>
  for (const name of Object.keys(EASE) as EaseName[]) {
    if (name === 'linear') {
      out[name] = 'linear'
      continue
    }
    const fn = EASE[name]
    const stops: string[] = []
    for (let i = 0; i <= 48; i++) stops.push(String(Math.round(fn(i / 48) * 10000) / 10000))
    out[name] = `linear(${stops.join(', ')})`
  }
  return out
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

interface Rect {
  l: number
  t: number
  r: number
  b: number
}

interface Layout {
  W: number
  H: number
  /** Stage (= image box) offset and size in hero pixels. */
  sx: number
  sy: number
  sw: number
  sh: number
  /** Hero pixels per image pixel. */
  k: number
  navH: number
  mobile: boolean
  rtl: boolean
  /** Hero areas a pin or the card must not sit under. */
  blocks: Rect[]
}

interface Glint {
  x: number
  y: number
  ph: number
  sp: number
  s: number
}

const NOOP_ENGINE: LivingMapEngine = {
  destroy() {},
  setUserPaused() {},
  step() {},
  goToPoint() {},
}

export function createLivingMap({ root, points, reduce, onSlide }: Options): LivingMapEngine {
  const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)
  const qa = <T extends Element>(selector: string) => [...root.querySelectorAll<T>(selector)]

  const stage = q<HTMLElement>('.lmh-stage')
  const mapImg = q<HTMLImageElement>('.lmh-map')
  const night = q<HTMLImageElement>('.lmh-night')
  const canvas = q<HTMLCanvasElement>('.lmh-sparkles')
  const spot = q<SVGRectElement>('.lmh-spot')
  const spotC = q<SVGCircleElement>('.lmh-spot-c')
  const route = q<SVGPathElement>('.lmh-route')
  const wisps = q<HTMLElement>('.lmh-wisps')
  const leaderG = q<SVGGElement>('.lmh-leader-g')
  const leaderP = q<SVGPathElement>('.lmh-leader-path')
  const leaderDot = q<SVGCircleElement>('.lmh-leader-dot')
  const card = q<HTMLElement>('.lmh-card')
  const bar = q<HTMLElement>('.lmh-bar-fill')
  const content = q<HTMLElement>('.lmh-content')
  const nav = q<HTMLElement>('.lmh-nav')
  const ctx = canvas?.getContext('2d') ?? null

  if (
    !stage ||
    !mapImg ||
    !night ||
    !canvas ||
    !ctx ||
    !spot ||
    !spotC ||
    !route ||
    !wisps ||
    !leaderG ||
    !leaderP ||
    !leaderDot ||
    !card ||
    !bar ||
    !content ||
    !nav
  ) {
    return NOOP_ENGINE
  }

  const pins = qa<SVGGElement>('.lmh-pin')
  const pops = qa<SVGGElement>('.lmh-pin-pop')
  const coastBase = qa<SVGPathElement>('.lmh-coast .base')
  const css = cssEasings()

  // ----- bookkeeping: everything started here is stopped in destroy() -----
  let destroyed = false
  const animations = new Set<Animation>()
  const timers = new Set<number>()
  const frames = new Map<number, number>()
  let frameSeq = 0
  const cleanups: (() => void)[] = []

  function animate(
    el: Element,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions & { ease?: EaseName },
  ): Animation {
    const { ease, ...rest } = options
    const a = el.animate(keyframes, { ...rest, easing: ease ? css[ease] : rest.easing })
    animations.add(a)
    const drop = () => animations.delete(a)
    a.addEventListener('finish', drop)
    a.addEventListener('cancel', drop)
    return a
  }

  /** Runs `fn` once `a` finishes; silently skips a cancelled animation. */
  function onDone(a: Animation, fn: () => void) {
    a.finished.then(
      () => {
        if (!destroyed) fn()
      },
      () => {},
    )
  }

  function later(ms: number, fn: () => void) {
    const id = window.setTimeout(() => {
      timers.delete(id)
      if (!destroyed) fn()
    }, ms)
    timers.add(id)
  }

  /** rAF tween of a number. Returns a cancel function. */
  function tween(o: {
    from: number
    to: number
    duration: number
    delay?: number
    ease: EaseName
    update(value: number): void
    done?(): void
  }): () => void {
    const key = ++frameSeq
    const start = performance.now() + (o.delay ?? 0)
    const fn = EASE[o.ease]
    const tick = (now: number) => {
      if (destroyed) return
      const t = Math.min(1, Math.max(0, (now - start) / o.duration))
      if (now >= start) o.update(o.from + (o.to - o.from) * fn(t))
      if (t < 1) frames.set(key, requestAnimationFrame(tick))
      else {
        frames.delete(key)
        o.done?.()
      }
    }
    frames.set(key, requestAnimationFrame(tick))
    return () => {
      const id = frames.get(key)
      if (id !== undefined) cancelAnimationFrame(id)
      frames.delete(key)
    }
  }

  function listen<K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    fn: (event: HTMLElementEventMap[K]) => void,
  ) {
    target.addEventListener(type, fn)
    cleanups.push(() => target.removeEventListener(type, fn))
  }

  // ----- layout ------------------------------------------------------------
  let L: Layout = measure()

  function measure(): Layout {
    const hr = root.getBoundingClientRect()
    const sr = stage!.getBoundingClientRect()
    const style = getComputedStyle(root)
    // The same test as the stylesheet's phone layout (a media query).
    const mobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches
    // Layout boxes (offset*), not getBoundingClientRect: the copy may be
    // mid-rise (translated) when this runs, and its resting place is what
    // matters. Text blocks are narrowed to the ink, so a short right-aligned
    // Arabic line does not hide the pins beside it.
    const at = (el: HTMLElement) => {
      let x = 0
      let y = 0
      for (let n: HTMLElement | null = el; n !== null && n !== root; ) {
        x += n.offsetLeft
        y += n.offsetTop
        n = n.offsetParent instanceof HTMLElement ? n.offsetParent : null
      }
      return { x, y }
    }
    const box = (el: Element, ink: boolean): Rect => {
      if (!(el instanceof HTMLElement)) return { l: 0, t: 0, r: 0, b: 0 }
      const o = at(el)
      const r: Rect = { l: o.x, t: o.y, r: o.x + el.offsetWidth, b: o.y + el.offsetHeight }
      if (!ink) return r
      const range = document.createRange()
      range.selectNodeContents(el)
      const text = range.getBoundingClientRect()
      if (text.width === 0) return r
      return { ...r, l: Math.max(r.l, text.left - hr.left), r: Math.min(r.r, text.right - hr.left) }
    }
    const copy = [...content!.children].flatMap((child) =>
      child.classList.contains('lmh-ctas')
        ? [...child.children].map((cta) => box(cta, false))
        : [box(child, true)],
    )
    return {
      W: hr.width,
      H: hr.height,
      sx: sr.left - hr.left,
      sy: sr.top - hr.top,
      sw: sr.width,
      sh: sr.height,
      k: sr.width / MAP_W,
      navH: Number.parseFloat(style.getPropertyValue('--nav-h')) || 64,
      mobile,
      rtl: style.direction === 'rtl',
      blocks: [...copy, box(nav!, false), ...(mobile ? [box(card!, false)] : [])],
    }
  }

  const toScreen = (x: number, y: number) => ({ x: L.sx + x * L.k, y: L.sy + y * L.k })

  // ----- which destinations fit at this size -------------------------------
  let list: number[] = []

  function computeList() {
    const m = L.mobile ? 16 : 36
    list = points
      .map((_, i) => i)
      .filter((i) => {
        const pt = points[i]
        if (!pt) return false
        const p = toScreen(pt.x, pt.y)
        if (p.x < m || p.x > L.W - m || p.y < L.navH + m / 2 || p.y > L.H - m) return false
        // Mobile: the stage fades out at its foot.
        if (L.mobile && p.y > L.sy + L.sh * 0.9) return false
        const g = L.mobile ? 12 : 24
        return !L.blocks.some(
          (r) => p.x > r.l - g && p.x < r.r + g && p.y > r.t - g && p.y < r.b + g,
        )
      })
    pins.forEach((pin, i) => {
      if (list.includes(i)) pin.removeAttribute('display')
      else pin.setAttribute('display', 'none')
    })
  }

  // ----- slider state --------------------------------------------------------
  let pos = -1
  let shown = 0
  let running = false
  let visible = true
  let userPaused = false
  let hoverPaused = false
  let focusPaused = false
  let barAnim: Animation | null = null
  let swapToken = 0
  let cancelSpot: (() => void) | null = null
  let cardAnims: Animation[] = []
  let leaderAnims: Animation[] = []

  function publish(active: number) {
    onSlide({ active, shown, pos: Math.max(0, pos), total: list.length })
  }

  function placeCard(i: number) {
    const pt = points[i]
    if (L.mobile || !pt) {
      card!.style.removeProperty('left')
      card!.style.removeProperty('top')
      leaderP!.setAttribute('d', '')
      return
    }
    const p = toScreen(pt.x, pt.y)
    const cw = card!.offsetWidth
    const ch = card!.offsetHeight
    const gx = 70
    const gy = 56
    const edge = 24
    const top0 = L.navH + 12
    // Prefer the side away from the copy: right in LTR, left in RTL.
    const sides = L.rtl ? [false, true] : [true, false]
    let best: { left: number; top: number; right: boolean; above: boolean; cost: number } | null =
      null
    for (const right of sides) {
      for (const above of [true, false]) {
        const left = right ? p.x + gx : p.x - gx - cw
        const rawTop = above ? p.y - gy - ch : p.y + gy
        const top = Math.min(L.H - ch - edge, Math.max(top0, rawTop))
        let cost = Math.abs(top - rawTop) * 4
        if (left < edge || left + cw > L.W - edge) cost += 1e6
        for (const r of L.blocks) {
          const ox = Math.max(0, Math.min(left + cw, r.r + 16) - Math.max(left, r.l - 16))
          const oy = Math.max(0, Math.min(top + ch, r.b + 16) - Math.max(top, r.t - 16))
          cost += ox * oy
        }
        // Never cover the pin it points at.
        if (p.x > left - 12 && p.x < left + cw + 12 && p.y > top - 12 && p.y < top + ch + 12)
          cost += 1e5
        if (best === null || cost < best.cost) best = { left, top, right, above, cost }
      }
    }
    if (best === null) return
    const left = Math.round(Math.max(edge, Math.min(L.W - cw - edge, best.left)))
    const top = Math.round(best.top)
    card!.style.setProperty('left', `${left}px`)
    card!.style.setProperty('top', `${top}px`)
    const ex = best.right ? left : left + cw
    const ey = best.above ? top + ch - 26 : top + 26
    const mx = p.x + (ex - p.x) * 0.45
    leaderP!.setAttribute('d', `M${r1(p.x)} ${r1(p.y)} L${r1(mx)} ${r1(ey)} L${r1(ex)} ${r1(ey)}`)
    leaderDot!.setAttribute('cx', String(r1(ex)))
    leaderDot!.setAttribute('cy', String(r1(ey)))
  }

  function moveSpot(i: number, instant: boolean) {
    const pt = points[i]
    if (!pt) return
    cancelSpot?.()
    if (instant) {
      spotC!.setAttribute('cx', String(pt.x))
      spotC!.setAttribute('cy', String(pt.y))
      return
    }
    const fx = Number(spotC!.getAttribute('cx')) || pt.x
    const fy = Number(spotC!.getAttribute('cy')) || pt.y
    cancelSpot = tween({
      from: 0,
      to: 1,
      duration: 1800,
      ease: 'sineInOut',
      update: (v) => {
        spotC!.setAttribute('cx', String(r1(fx + (pt.x - fx) * v)))
        spotC!.setAttribute('cy', String(r1(fy + (pt.y - fy) * v)))
      },
    })
  }

  function cancelAll(items: Animation[]) {
    for (const a of items) a.cancel()
    items.length = 0
  }

  /** A quiet crossfade: card and leader line fade out, the content swaps,
      both fade back in. No movement, no blur, no line drawing. */
  function swap(i: number) {
    const token = ++swapToken
    const cardFrom = getComputedStyle(card!).opacity
    const lineFrom = getComputedStyle(leaderG!).opacity
    cancelAll(cardAnims)
    cancelAll(leaderAnims)
    card!.classList.remove('is-shown')
    leaderG!.classList.remove('is-shown')
    const out = animate(card!, [{ opacity: cardFrom }, { opacity: 0 }], {
      duration: 450,
      ease: 'sineInOut',
      fill: 'forwards',
    })
    cardAnims.push(out)
    leaderAnims.push(
      animate(leaderG!, [{ opacity: lineFrom }, { opacity: 0 }], {
        duration: 450,
        ease: 'sineInOut',
        fill: 'forwards',
      }),
    )
    onDone(out, () => {
      if (token !== swapToken) return
      shown = i
      publish(i)
      placeCard(i)
      cancelAll(leaderAnims)
      const line = animate(leaderG!, [{ opacity: 0 }, { opacity: 1 }], {
        delay: 250,
        duration: 800,
        ease: 'sineInOut',
        fill: 'both',
      })
      leaderAnims.push(line)
      onDone(line, () => {
        leaderG!.classList.add('is-shown')
        line.cancel()
      })
      const inn = animate(card!, [{ opacity: 0 }, { opacity: 1 }], {
        delay: 150,
        duration: 750,
        ease: 'sineInOut',
        fill: 'both',
      })
      cardAnims = [inn]
      out.cancel()
      onDone(inn, () => {
        card!.classList.add('is-shown')
        inn.cancel()
      })
    })
  }

  function restartBar() {
    barAnim?.cancel()
    barAnim = null
    if (reduce) return
    const a = animate(bar!, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: INTERVAL,
      easing: 'linear',
      fill: 'forwards',
    })
    barAnim = a
    onDone(a, () => {
      if (barAnim === a) go(pos + 1, false)
    })
  }

  function sync() {
    const playing =
      running &&
      !reduce &&
      !userPaused &&
      !hoverPaused &&
      !focusPaused &&
      visible &&
      !document.hidden
    if (barAnim && barAnim.playState !== 'finished') {
      if (playing) barAnim.play()
      else barAnim.pause()
    }
    // Announce changes only when they are not happening on their own
    // (WAI-ARIA carousel pattern): a live region that speaks every 8s is
    // noise, one that answers the visitor's own click is feedback.
    card!.setAttribute('aria-live', playing ? 'off' : 'polite')
    root.classList.toggle('is-playing', playing)
  }

  function go(n: number, user: boolean) {
    if (destroyed || list.length === 0) return
    const len = list.length
    const next = ((n % len) + len) % len
    if (next === pos && !user) return
    pos = next
    const i = list[next] ?? 0
    if (user && !running && !reduce) running = true
    if (reduce) {
      shown = i
      publish(i)
      placeCard(i)
      leaderG!.classList.add('is-shown')
      card!.classList.add('is-shown')
      moveSpot(i, true)
      sync()
      return
    }
    publish(i)
    moveSpot(i, false)
    swap(i)
    restartBar()
    sync()
  }

  function goToPoint(index: number) {
    const p = list.indexOf(index)
    if (p > -1) go(p, true)
  }

  // ----- reveal ------------------------------------------------------------
  const revealFrom = points[0] ?? { x: MAP_W / 2, y: MAP_H / 2 }
  /** Opacity of the dim around the active pin (matches hero.css). */
  const SPOT = 0.2

  function finishReveal() {
    root.classList.add('is-revealed')
    night!.style.removeProperty('--r')
    for (const p of coastBase) p.style.removeProperty('opacity')
  }

  /** The end state, at once: reduced motion, or a page that hydrated late. */
  function settle() {
    root.classList.remove('is-pending', 'is-waiting')
    root.classList.add('is-revealed', 'is-clear', 'is-lit')
    route!.classList.add('is-drawn')
    computeList()
    const p = list.indexOf(0)
    if (!reduce) running = true
    go(p > -1 ? p : 0, false)
  }

  /** Fade up from a short distance: no clipping, no rotation, no overshoot. */
  function rise(els: Element[], at: number, duration: number, gap = 0, lift = '12px') {
    els.forEach((el, k) =>
      animate(
        el,
        [
          { opacity: 0, transform: `translateY(${lift})` },
          { opacity: 1, transform: 'none' },
        ],
        { delay: at + k * gap, duration, ease: 'cubicOut', fill: 'backwards' },
      ),
    )
  }

  function startIntro() {
    // 1 — the clouds drift apart on their own (hero.css), from the first
    // paint: they must not wait for this script. Drop them once they are gone.
    later(2100, () => root.classList.add('is-clear'))

    // 2 — a thin, faint coastline is traced once
    coastBase.forEach((p, k) => {
      p.style.setProperty('opacity', '1')
      const a = animate(p, [{ strokeDashoffset: 1000 }, { strokeDashoffset: 0 }], {
        delay: 300 + k * 100,
        duration: 1600,
        ease: 'sineInOut',
        fill: 'both',
      })
      onDone(a, () => a.cancel())
    })

    // 5 — typography (independent of the image, so never held for it)
    for (const line of qa('.lmh-eyebrow-line'))
      animate(line, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
        delay: 1100,
        duration: 1000,
        ease: 'sineInOut',
        fill: 'backwards',
      })
    rise(qa('.lmh-eyebrow-text'), 1100, 900)
    rise(qa('.lmh-word > span'), 1200, 1000, 45, '0.3em')
    rise(qa('.lmh-sub'), 1500, 1000)
    rise(qa('.lmh-facts'), 1600, 1000)
    rise(qa('.lmh-ctas > *'), 1700, 1000, 80)
    rise([nav!], 2000, 900, 0, '0px')

    root.classList.remove('is-pending')

    // 3, 4, 6 — wait for the colour map (but not for long)
    const started = performance.now()
    let begun = false
    const begin = () => {
      if (begun || destroyed) return
      begun = true
      const wait = Math.max(0, REVEAL_AT - (performance.now() - started))
      later(wait, phaseB)
    }
    later(REVEAL_AT + DECODE_GRACE, begin)
    const decoded = mapImg!.complete && mapImg!.naturalWidth > 0
    if (decoded) begin()
    else mapImg!.decode().then(begin, begin)
  }

  function phaseB() {
    L = measure()
    computeList()
    // 3 — a soft radial fade from Ubud uncovers the colour map; the night
    // map's last traces dissolve rather than being swept off
    const c = { x: revealFrom.x * L.k, y: revealFrom.y * L.k }
    const maxR = Math.hypot(Math.max(c.x, L.sw - c.x), Math.max(c.y, L.sh - c.y)) + 320
    night!.style.setProperty('--cx', `${r1(c.x)}px`)
    night!.style.setProperty('--cy', `${r1(c.y)}px`)
    tween({
      from: 0,
      to: maxR,
      duration: 1900,
      ease: 'sineInOut',
      update: (r) => night!.style.setProperty('--r', `${r1(r)}px`),
    })
    animate(night!, [{ opacity: 1 }, { opacity: 0 }], {
      delay: 1000,
      duration: 900,
      ease: 'sineInOut',
      fill: 'forwards',
    })
    later(1950, finishReveal)

    // 4 — pins fade in, nearest to Ubud first
    const o = points[0] ?? revealFrom
    pops.forEach((g, i) => {
      const pt = points[i] ?? o
      const delay = 500 + (Math.hypot(pt.x - o.x, pt.y - o.y) / 1200) * 400
      const a = animate(
        g,
        [
          { opacity: 0, transform: 'scale(0.8)' },
          { opacity: 1, transform: 'none' },
        ],
        { delay, duration: 800, ease: 'cubicOut', fill: 'both' },
      )
      onDone(a, () => a.cancel())
    })

    // …and the route is drawn once, then rests (hero.css fades it down)
    const len = route!.getTotalLength()
    route!.style.setProperty('stroke-dasharray', String(len))
    const draw = animate(route!, [{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      delay: 600,
      duration: 1700,
      ease: 'sineInOut',
      fill: 'both',
    })
    onDone(draw, () => {
      route!.style.removeProperty('stroke-dasharray')
      draw.cancel()
      route!.classList.add('is-drawn')
    })

    // 6 — a light vignette around the pin, then the destination slider
    const lit = animate(spot!, [{ opacity: 0 }, { opacity: SPOT }], {
      delay: 1300,
      duration: 1400,
      ease: 'sineInOut',
      fill: 'both',
    })
    onDone(lit, () => {
      root.classList.add('is-lit')
      lit.cancel()
    })
    later(1600, () => {
      running = true
      const p = list.indexOf(0)
      go(p > -1 ? p : 0, false)
    })

    root.classList.remove('is-waiting')
  }

  // ----- ambient: a few dim sun glints on the water -------------------------
  /** Peak opacity of a glint. */
  const GLINT_ALPHA = 0.4
  let glints: Glint[] = []
  let glintFrame = 0

  function sizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    canvas!.width = Math.round(L.W * ratio)
    canvas!.height = Math.round(L.H * ratio)
    ctx!.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  function sampleGlints() {
    try {
      const sw = 360
      const sh = Math.round((sw * MAP_H) / MAP_W)
      const c = document.createElement('canvas')
      c.width = sw
      c.height = sh
      const x = c.getContext('2d', { willReadFrequently: true })
      if (!x) return
      x.drawImage(mapImg!, 0, 0, sw, sh)
      const px = x.getImageData(0, 0, sw, sh).data
      const found: Glint[] = []
      for (let t = 0; t < 30000 && found.length < 28; t++) {
        const u = Math.floor(Math.random() * sw)
        const v = Math.floor(Math.random() * sh)
        const o = (v * sw + u) * 4
        const r = px[o] ?? 0
        const g = px[o + 1] ?? 0
        const b = px[o + 2] ?? 0
        if (b > 140 && g > 105 && r < 120 && b > r + 50)
          found.push({
            x: (u / sw) * MAP_W,
            y: (v / sh) * MAP_H,
            ph: Math.random() * 7,
            sp: 0.2 + Math.random() * 0.4,
            s: 0.8 + Math.random() * 1.2,
          })
      }
      glints = found
    } catch {
      glints = []
    }
    sizeCanvas()
    kickGlints()
  }

  const drawing = () => visible && !document.hidden && !reduce && glints.length > 0

  function drawGlints(now: number) {
    glintFrame = 0
    if (destroyed) return
    ctx!.clearRect(0, 0, L.W, L.H)
    if (!drawing()) return
    const t = now / 1000
    const maxY = L.mobile ? L.sy + L.sh * 0.88 : L.H
    ctx!.fillStyle = '#fff'
    for (const g of glints) {
      const a = Math.max(0, Math.sin(t * g.sp + g.ph)) ** 8
      if (a < 0.02) continue
      const p = toScreen(g.x, g.y)
      if (p.y > maxY || p.x < 0 || p.x > L.W) continue
      const s = g.s * (0.6 + a * 0.8)
      ctx!.globalAlpha = a * GLINT_ALPHA
      ctx!.fillRect(p.x - s * 2.2, p.y - 0.5, s * 4.4, 1)
      ctx!.fillRect(p.x - 0.5, p.y - s * 2.2, 1, s * 4.4)
      ctx!.beginPath()
      ctx!.arc(p.x, p.y, s * 0.55, 0, Math.PI * 2)
      ctx!.fill()
    }
    ctx!.globalAlpha = 1
    glintFrame = requestAnimationFrame(drawGlints)
  }

  function kickGlints() {
    if (!destroyed && glintFrame === 0 && drawing()) glintFrame = requestAnimationFrame(drawGlints)
  }

  // ----- ambient: drifting cloud wisps -------------------------------------
  function addWisps() {
    const count = L.mobile ? 2 : 3
    for (let i = 0; i < count; i++) {
      const w = document.createElement('div')
      const s = 160 + Math.random() * 220
      w.className = 'lmh-wisp'
      w.style.setProperty('width', `${Math.round(s * 2)}px`)
      w.style.setProperty('height', `${Math.round(s * 0.6)}px`)
      w.style.setProperty('top', `${Math.round(Math.random() * 75)}%`)
      w.style.setProperty('opacity', String(r1(0.12 + Math.random() * 0.1, 100)))
      w.style.setProperty('animation-duration', `${Math.round(150 + Math.random() * 70)}s`)
      w.style.setProperty('animation-delay', `${-Math.round(Math.random() * 200)}s`)
      wisps!.appendChild(w)
    }
  }

  // ----- pause / resume / resize -------------------------------------------
  const io = new IntersectionObserver(
    (entries) => {
      const entry = entries[entries.length - 1]
      if (!entry) return
      visible = entry.isIntersecting
      root.classList.toggle('is-offscreen', !visible)
      sync()
      kickGlints()
    },
    { threshold: 0.15 },
  )
  io.observe(root)

  const onVisibility = () => {
    sync()
    kickGlints()
  }
  document.addEventListener('visibilitychange', onVisibility)
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility))

  listen(card, 'pointerenter', () => {
    hoverPaused = true
    sync()
  })
  listen(card, 'pointerleave', () => {
    hoverPaused = false
    sync()
  })
  // Keyboard focus anywhere in the card or the slider controls stops the
  // rotation (WCAG 2.2.2); a mouse click on an arrow does not.
  const onFocusIn = (event: FocusEvent) => {
    const target = event.target
    focusPaused = target instanceof Element && target.matches(':focus-visible')
    sync()
  }
  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (!(next instanceof Node) || (!card.contains(next) && !nav.contains(next))) {
      focusPaused = false
      sync()
    }
  }
  listen(card, 'focusin', onFocusIn)
  listen(nav, 'focusin', onFocusIn)
  listen(card, 'focusout', onFocusOut)
  listen(nav, 'focusout', onFocusOut)

  let resizeTimer = 0
  let lastSize = `${root.clientWidth}x${root.clientHeight}`
  const ro = new ResizeObserver(() => {
    const size = `${root.clientWidth}x${root.clientHeight}`
    if (size === lastSize) return
    lastSize = size
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (destroyed) return
      L = measure()
      sizeCanvas()
      const current = list[pos]
      computeList()
      if (!running && !reduce) return
      const p = current === undefined ? -1 : list.indexOf(current)
      if (p > -1) {
        pos = p
        publish(current ?? 0)
        placeCard(current ?? 0)
      } else {
        pos = -1
        go(0, false)
      }
    }, 150)
  })
  ro.observe(root)

  // ----- start ---------------------------------------------------------------
  // On the next frame, so layout has settled and React has finished
  // committing (the first `publish` re-renders the card).
  const startFrame = requestAnimationFrame(() => {
    if (destroyed) return
    L = measure()
    computeList()
    sizeCanvas()
    if (!reduce) addWisps()
    if (mapImg.complete && mapImg.naturalWidth > 0) later(0, sampleGlints)
    else listen(mapImg, 'load', () => sampleGlints())

    // If the page hydrated so late that the no-JS failsafe is under way,
    // skip the intro rather than replay it over a half-revealed page.
    const failsafe = night
      .getAnimations()
      .find((a) => 'animationName' in a && String(a.animationName).startsWith('lmh-fs'))
    const late = Number(failsafe?.currentTime ?? 0) > LATE_HYDRATION
    if (reduce || late) settle()
    else startIntro()
  })

  return {
    destroy() {
      destroyed = true
      cancelAnimationFrame(startFrame)
      if (glintFrame) cancelAnimationFrame(glintFrame)
      for (const id of frames.values()) cancelAnimationFrame(id)
      frames.clear()
      for (const id of timers) window.clearTimeout(id)
      timers.clear()
      window.clearTimeout(resizeTimer)
      for (const a of [...animations]) a.cancel()
      animations.clear()
      io.disconnect()
      ro.disconnect()
      for (const fn of cleanups) fn()
      // Back to the server-rendered state, so a remount starts clean.
      wisps.replaceChildren()
      root.classList.remove('is-revealed', 'is-clear', 'is-lit', 'is-offscreen', 'is-playing')
      root.classList.add('is-pending', 'is-waiting')
      route.classList.remove('is-drawn')
      route.style.removeProperty('stroke-dasharray')
      for (const p of coastBase) p.style.removeProperty('opacity')
      night.style.removeProperty('--r')
      card.classList.remove('is-shown')
      card.style.removeProperty('left')
      card.style.removeProperty('top')
      leaderG.classList.remove('is-shown')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
    },
    setUserPaused(paused) {
      userPaused = paused
      sync()
    },
    step(delta) {
      go(pos + delta, true)
    },
    goToPoint,
  }
}

/** Round for attribute strings: 1 decimal by default. */
function r1(value: number, scale = 10): number {
  return Math.round(value * scale) / scale
}
