'use client'

/**
 * The 3D island.
 *
 * Loaded ONLY through the dynamic import in map-surface, never at module
 * scope: three.js is several hundred kilobytes, and a static import would put
 * all of it in the shared client bundle for every route on the site.
 *
 * The scene itself lives in island-scene.ts as plain three.js. This component
 * does nothing but own a container element, mount the scene into it once, feed
 * it pins, and tear it down. Keeping React out of the render loop matters:
 * the scene redraws every frame, and a component that re-rendered with it
 * would fight the animation rather than host it.
 */

import { useEffect, useRef, useState } from 'react'

import type { IslandHandle, IslandPin } from './island-scene'

/** Re-exported under the old name so callers did not have to change. */
export type ScenePin = IslandPin

export type Map3DProps = {
  /**
   * Only UNLOCKED places. A locked place carries no coordinates at all (see
   * redactPlace in src/lib/entitlements/redaction.ts), so it cannot be
   * positioned even by mistake — the paywall holds by construction rather
   * than by this component remembering to hide anything.
   */
  pins: readonly ScenePin[]
  /** Called once the island is on screen, to retire the loader. */
  onReady?: () => void
  /** Slug of the place a visitor tapped, for the detail panel. */
  onSelect?: (slug: string) => void
}

export default function Map3D({ pins, onReady, onSelect }: Map3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<IslandHandle | null>(null)
  const [failed, setFailed] = useState(false)
  /**
   * Bumped when the scene finishes building.
   *
   * The pins array is memoised upstream, so it is referentially stable and the
   * effect that feeds it runs exactly once — on mount, before this async
   * scene exists. Without this counter in its dependencies the handle is null
   * at that moment, setPins is never called again, and the island renders
   * with no pins at all.
   */
  const [sceneEpoch, setSceneEpoch] = useState(0)

  /**
   * Callbacks held in refs and read through them inside the effect, so that a
   * parent re-render with a new closure does not tear down and rebuild the
   * whole scene. Rebuilding means re-decoding the heightmap and re-uploading
   * every texture.
   */
  const onSelectRef = useRef(onSelect)
  const onReadyRef = useRef(onReady)

  // Updated in an effect, not during render: writing a ref while rendering is
  // a tearing hazard under concurrent rendering, because the render may be
  // discarded while the write has already happened.
  useEffect(() => {
    onSelectRef.current = onSelect
    onReadyRef.current = onReady
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let cancelled = false

    void (async () => {
      try {
        const { createIslandScene } = await import('./island-scene')
        if (cancelled) return
        const handle = await createIslandScene(container, {
          onSelect: (slug) => onSelectRef.current?.(slug),
          onReady: () => onReadyRef.current?.(),
        })
        if (cancelled) {
          handle.dispose()
          return
        }
        handleRef.current = handle
        setSceneEpoch((n) => n + 1)
      } catch {
        // A WebGL context can be refused after the capability check passed —
        // a driver reset, or too many live contexts on the page. Surfacing it
        // lets map-surface fall back to the flat map instead of leaving a
        // visitor staring at an empty blue rectangle.
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      handleRef.current?.dispose()
      handleRef.current = null
    }
  }, [])

  // Runs when the pins change (a filter or a search) AND when the scene first
  // becomes available, whichever happens second.
  useEffect(() => {
    handleRef.current?.setPins(pins)
  }, [pins, sceneEpoch])

  if (failed) {
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
        Could not start the 3D map.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      // Reflects what actually reached the scene. A WebGL canvas is opaque to
      // every debugging tool and every test: without this there is no way to
      // tell "no pins were sent" from "pins were sent and are not visible",
      // and those have completely different causes.
      data-pin-count={pins.length}
      data-scene-ready={sceneEpoch > 0 ? 'yes' : 'no'}
      style={{ position: 'absolute', inset: 0 }}
    />
  )
}
