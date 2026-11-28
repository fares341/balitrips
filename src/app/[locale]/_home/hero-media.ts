/**
 * Home hero media — the ONLY place the hero videos and their posters are named.
 *
 * Footage: the owner's own drone filming, Nusa Penida, 16 Nov 2026 (no
 * third-party licence needed). To swap a clip, drop the new files into
 * public/brand/hero/ and change the paths below — nothing else references
 * them (Studio → «محتوى الموقع» → videos can also replace one at runtime).
 *
 * Each clip: ~8 s, 1080×1920 (portrait), 30 fps, silent, loops on itself
 * (short crossfade at the seam); WebM (VP9) first then MP4 (H.264,
 * faststart); the 720×1280 WebP is the first frame, used as the poster (shown
 * first, and the only thing shown with reduced motion).
 * `label`/`short` are message keys (the place changes with each clip).
 */

export type HeroClip = {
  /** Stable key. */
  id: string
  webm: string
  mp4: string
  poster: string
  /** Message key: the long label in the place pill, e.g. "Kelingking · Nusa Penida". */
  label: string
  /** Message key: the short name on the progress tab and the desktop caption. */
  short: string
}

export const HERO_CLIPS: readonly HeroClip[] = [
  {
    id: 'kelingking',
    webm: '/brand/hero/hero-kelingking.webm',
    mp4: '/brand/hero/hero-kelingking.mp4',
    poster: '/brand/hero/hero-kelingking.webp',
    label: 'hv4_pl_kelingking',
    short: 'hv4_pl_kelingking_s',
  },
  {
    id: 'boat',
    webm: '/brand/hero/hero-boat.webm',
    mp4: '/brand/hero/hero-boat.mp4',
    poster: '/brand/hero/hero-boat.webp',
    label: 'hv4_pl_boat',
    short: 'hv4_pl_boat_s',
  },
  {
    id: 'coast',
    webm: '/brand/hero/hero-coast.webm',
    mp4: '/brand/hero/hero-coast.mp4',
    poster: '/brand/hero/hero-coast.webp',
    label: 'hv4_pl_coast',
    short: 'hv4_pl_coast_s',
  },
]

/** Milliseconds each clip stays active before the next one (package: 7 s). */
export const HERO_STEP_MS = 7000
