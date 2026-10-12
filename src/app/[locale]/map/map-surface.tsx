'use client'

/**
 * Chooses which map a visitor gets.
 *
 * 3D is the primary experience, by the owner's decision. The 2D explorer stays
 * as the fallback, and is not a lesser consolation: it is what runs when WebGL
 * is missing or refuses, which is a real slice of real customers rather than a
 * theoretical one. A phone in low-power mode, a locked-down work laptop, a
 * driver crash, an old Android — all land here.
 *
 * Note the page ALSO renders a server-side list of every open place as real
 * links, below whichever surface loads. That is the accessibility floor and it
 * is untouched by any of this: a canvas, 2D or 3D, is not something a crawler
 * reads or a screen-reader user can browse.
 */

import dynamic from 'next/dynamic'
import { useTranslations } from 'next-intl'
import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

import { MapAccessBar } from './map-access-bar'
import { MapExplorer, type MapExplorerProps } from './map-explorer'
import { MapFilterBar, useMapFilters } from './map-filters'
import { MapWatermark, protectionHandlers } from './map-protect'
import { MapResults } from './map-results'
import type { ScenePin } from './map-3d'
import { NodePanel } from './node-panel'
import { buildPins, type MapPin } from './projection'

/**
 * ssr:false is required, not stylistic: three.js touches `window` and
 * `document` at module scope, and the renderer has no meaning on a server.
 * The dynamic import is also what keeps three.js out of every other route's
 * bundle — a static import would ship it site-wide.
 */
const Map3D = dynamic(() => import('./map-3d'), {
  ssr: false,
  loading: () => <SurfaceMessage text="Loading the island…" />,
})

function SurfaceMessage({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(160deg,#0c4a63,#072a3e)',
        color: 'rgba(255,255,255,.72)',
        fontSize: 14,
      }}
    >
      {text}
    </div>
  )
}

/**
 * Can this device actually run the scene?
 *
 * Checked by creating a context rather than sniffing the user agent, because
 * the question is not "which browser is this" but "will a canvas render".
 * The context is released immediately: browsers cap the number of live WebGL
 * contexts (often around 16) and leaking one from a feature test is a way to
 * break the real canvas later on the same page.
 */
function detectWebGL(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    const lose = gl.getExtension('WEBGL_lose_context')
    lose?.loseContext()
    return true
  } catch {
    return false
  }
}

/** Honours the OS-level "reduce motion" setting and Save-Data. */
function prefersLightweight(): boolean {
  if (typeof window === 'undefined') return false
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  return reduced || connection?.saveData === true
}

type Surface = 'deciding' | '3d' | '2d'

/**
 * Cached at module scope, because `getSnapshot` must be cheap and must return
 * a stable value: React calls it on every render, and `detectWebGL()` creates
 * a real WebGL context each time. Browsers cap live contexts at around 16, so
 * an uncached probe would exhaust them and break the very canvas it is testing
 * for.
 */
let cachedSurface: Surface | null = null

function clientSurface(): Surface {
  cachedSurface ??= detectWebGL() && !prefersLightweight() ? '3d' : '2d'
  return cachedSurface
}

/** Nothing to subscribe to — the answer cannot change within a page view. */
const noSubscribe = () => () => {}

/** The server cannot know, and must not guess, or hydration mismatches. */
const serverSurface = (): Surface => 'deciding'

export function MapSurface(props: MapExplorerProps) {
  const t = useTranslations()
  /**
   * Build the pins once from the redacted payload.
   *
   * `locked: false` is the type guard AND the paywall: a locked place is
   * `{ id, locked, requiredEntitlement }` with no coordinates, so it cannot
   * be projected even by accident. Nothing here has to remember to hide
   * anything — there is nothing to hide.
   */
  const pins = useMemo<MapPin[]>(
    // Identical to the flat map's (`buildPins`), so a query that finds a place
    // there finds it here — in all three languages, whatever the UI locale.
    () => buildPins(props.places, props.taxonomy.categories),
    [props.places, props.taxonomy.categories],
  )

  // `/map?place=<slug>` (بحث الموقع، المفضلة، رحلتي) يفتح لوحة المكان هنا أيضاً.
  // مكان مقفل لا يُطابق أي دبوس، فلا تُفتح لوحة له.
  const [selectedSlug, setSelectedSlug] = useState<string | null>(() => props.initialSlug)
  const filters = useMapFilters(pins, (pin) => setSelectedSlug(pin.place.slug), {
    taxonomy: props.taxonomy,
    vipFirst: props.vipFirst,
  })
  const { matched } = filters

  const scenePins = useMemo<ScenePin[]>(
    () =>
      matched.map((pin) => ({
        id: pin.place.id,
        slug: pin.place.slug,
        name: pin.place.slug,
        u: pin.nx,
        v: pin.ny,
        color: pin.color,
      })),
    [matched],
  )

  const selected = pins.find((pin) => pin.place.slug === selectedSlug) ?? null

  /**
   * useSyncExternalStore rather than an effect: this reads a browser
   * capability that exists before paint, so an effect would render once with
   * the wrong answer and then again with the right one -- a flash of the flat
   * map before the island, on every visit.
   */
  const detected = useSyncExternalStore(noSubscribe, clientSurface, serverSurface)
  const [forcedFlat, setForcedFlat] = useState(false)
  const [ready, setReady] = useState(false)

  const surface: Surface = forcedFlat ? '2d' : detected

  const onReady = useCallback(() => setReady(true), [])
  // WebGL رُفض بعد فحص القدرة (إعادة تشغيل المعالج، سياقات كثيرة): الخريطة المسطحة.
  const onFailed = useCallback(() => setForcedFlat(true), [])

  if (surface === '2d') return <MapExplorer {...props} />

  const guarded = props.viewerLabel !== null

  return (
    <div
      className={guarded ? 'bt-mapwrap bt-map-protected' : 'bt-mapwrap'}
      style={{ marginTop: 0 }}
    >
      <div
        className="bt-mapframe is-3d"
        style={{ position: 'relative' }}
        {...protectionHandlers(guarded)}
      >
        {surface === 'deciding' ? (
          <SurfaceMessage text={t('map_loading_island')} />
        ) : (
          <Map3D
            pins={scenePins}
            onReady={onReady}
            onSelect={setSelectedSlug}
            onFailed={onFailed}
          />
        )}

        {/* The same panel the flat map uses. Reused rather than rebuilt: it
            already handles localisation, focus management and the locked
            state, and two panels would drift apart. */}
        {selected ? <NodePanel pin={selected} onClose={() => setSelectedSlug(null)} /> : null}

        {props.viewerLabel !== null && <MapWatermark label={props.viewerLabel} />}

        {/* Same chrome as the flat map, same CSS classes. Rebuilding it with
            new styles would give the site two map UIs that drift apart. */}
        <MapFilterBar f={filters} />

        {/* Same access bar as the flat map: "unlocked", or the locked count and
            the way to buy. The 3D view had no upsell at all. */}
        <MapAccessBar unlocked={props.unlocked} lockedCount={props.lockedCount} />

        {/* An explicit way back to the flat map. Some people simply prefer it,
            and a 3D view with no exit is a trap rather than a feature. */}
        <button
          type="button"
          onClick={() => setForcedFlat(true)}
          style={{
            position: 'absolute',
            insetInlineEnd: 12,
            bottom: props.unlocked ? 12 : 92,
            zIndex: 2,
            border: '1px solid rgba(255,255,255,.28)',
            background: 'rgba(8,26,38,.72)',
            color: '#fff',
            borderRadius: 999,
            padding: '7px 14px',
            fontSize: 13,
            cursor: 'pointer',
            backdropFilter: 'blur(6px)',
          }}
        >
          {t('map_flat')}
        </button>

        {!ready && surface === '3d' ? <SurfaceMessage text={t('map_loading_island')} /> : null}
      </div>

      <MapResults
        pins={matched}
        near={filters.near}
        onShow={(pin) => setSelectedSlug(pin.place.slug)}
      />

      {guarded && <p className="bt-map-printnote">{t('map_print_blocked')}</p>}
    </div>
  )
}
