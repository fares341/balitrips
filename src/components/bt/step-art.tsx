/**
 * StepArt — two-tone line illustrations for StepCards (Bluuu-style).
 *
 * Drawn on a 72×72 viewBox: a forest-green line drawing with the lower part of
 * each subject filled by a soft green gradient, plus one orange accent and a
 * small sparkle, so every card reads as a little picture rather than a UI icon.
 * Colours come from the design tokens through CSS variables (bt.css "Step
 * cards"), so the art follows the palette. Decorative: aria-hidden.
 *
 * Add a new picture by adding a key here and using it in the step list.
 */

import type { CSSProperties, ReactNode } from 'react'

export type StepArtName = 'itinerary' | 'package' | 'activity' | 'driver'

function Sparkle({ x, y }: { x: number; y: number }) {
  return <path d={`M${x} ${y - 3.5}v7M${x - 3.5} ${y}h7`} className="sa-line" strokeWidth={1.6} />
}

/** Gradient id is per picture name: each picture appears once per page. */
function Frame({ name, children }: { name: StepArtName; children: ReactNode }) {
  const grad = `sa-g-${name}`
  return (
    <svg
      viewBox="0 0 72 72"
      width="72"
      height="72"
      className="step-art"
      aria-hidden="true"
      focusable="false"
      style={{ '--sa-fill': `url(#${grad})` } as CSSProperties}
    >
      <defs>
        <linearGradient id={grad} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className="sa-stop-a" />
          <stop offset="1" className="sa-stop-b" />
        </linearGradient>
      </defs>
      {children}
    </svg>
  )
}

const ART: Record<StepArtName, ReactNode> = {
  // Folded map with a dotted route and a pin
  itinerary: (
    <>
      <path d="M10 22l16-6 20 6 16-6v36l-16 6-20-6-16 6z" className="sa-paper" />
      <path d="M10 40l16-6 20 6 16-6v18l-16 6-20-6-16 6z" className="sa-fill" />
      <path d="M10 22l16-6 20 6 16-6v36l-16 6-20-6-16 6zM26 16v36M46 22v36" className="sa-line" />
      <path d="M17 44c5-8 12-2 17-8s9-10 15-6" className="sa-route" />
      <path d="M51 15.5c0 5-6 11-6 11s-6-6-6-11a6 6 0 0 1 12 0z" className="sa-accent" />
      <circle cx="45" cy="15.5" r="2.2" className="sa-paper" />
      <Sparkle x={9} y={10} />
    </>
  ),
  // Suitcase with straps and a travel sticker
  package: (
    <>
      <path d="M28 20v-5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v5" className="sa-line" />
      <rect x="12" y="20" width="48" height="38" rx="6" className="sa-paper" />
      <path d="M12 40h48v12a6 6 0 0 1-6 6H18a6 6 0 0 1-6-6z" className="sa-fill" />
      <rect x="12" y="20" width="48" height="38" rx="6" className="sa-line" />
      <path d="M24 20v38M48 20v38" className="sa-line" />
      <circle cx="36" cy="31" r="5.5" className="sa-accent" />
      <path d="M33.5 31h5M36 28.5v5" className="sa-paper-line" />
      <path d="M18 62v2M54 62v2" className="sa-line" />
      <Sparkle x={63} y={11} />
    </>
  ),
  // Volcano at sunrise over the sea (Mount Batur)
  activity: (
    <>
      <circle cx="36" cy="36" r="26" className="sa-paper" />
      <circle cx="47" cy="22" r="6" className="sa-accent" />
      <path d="M10 46l14-18 6 6 6-10 14 22z" className="sa-paper" />
      <path d="M10 46h52a26 26 0 0 1-52 0z" className="sa-fill" />
      <path d="M12 46l12-18 6 6 6-10 16 22" className="sa-line" />
      <path d="M33 24l3-5M38 22l3-3" className="sa-line" />
      <path d="M17 52c3 1.5 5 1.5 8 0s5-1.5 8 0M39 52c3 1.5 5 1.5 8 0" className="sa-wave" />
      <circle cx="36" cy="36" r="26" className="sa-line" />
      <Sparkle x={9} y={12} />
    </>
  ),
  // Car on the road
  driver: (
    <>
      <path
        d="M9 44v-6a4 4 0 0 1 3-4l6-1 7-9a6 6 0 0 1 5-2h13a6 6 0 0 1 5 2.5l6 8.5 5 1a4 4 0 0 1 3 4v6z"
        className="sa-paper"
      />
      <path d="M9 38h54v6a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z" className="sa-fill" />
      <path
        d="M9 44v-6a4 4 0 0 1 3-4l6-1 7-9a6 6 0 0 1 5-2h13a6 6 0 0 1 5 2.5l6 8.5 5 1a4 4 0 0 1 3 4v6a3 3 0 0 1-3 3H12a3 3 0 0 1-3-3z"
        className="sa-line"
      />
      <path d="M22 33l6-7.5h8V33zM40 33v-7.5h4.5l5.5 7.5z" className="sa-line" />
      <circle cx="21" cy="47" r="6" className="sa-paper" />
      <circle cx="21" cy="47" r="6" className="sa-line" />
      <circle cx="51" cy="47" r="6" className="sa-paper" />
      <circle cx="51" cy="47" r="6" className="sa-line" />
      <circle cx="21" cy="47" r="2" className="sa-accent" />
      <circle cx="51" cy="47" r="2" className="sa-accent" />
      <path d="M6 58h14M28 58h16M52 58h14" className="sa-route" />
      <Sparkle x={62} y={14} />
    </>
  ),
}

export function StepArt({ name }: { name: StepArtName }) {
  return <Frame name={name}>{ART[name]}</Frame>
}
