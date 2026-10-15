/**
 * Client-safe part of the landmarks: the shape the page sends and how the
 * markers look. The landmark DATA lives in `./landmarks.ts` (server-only) and
 * reaches the browser already filtered for the viewer.
 */

export type LandmarkCategory = 'settlement' | 'volcano' | 'lake' | 'island' | 'temple'

/** One landmark as sent to the map page, in the page language. */
export interface MapLandmark {
  id: string
  name: string
  /** English / Indonesian name, shown under a translated one. */
  latin: string
  desc: string
  cat: LandmarkCategory
  rank: 1 | 2 | 3
  lng: number
  lat: number
  /** Elevation in metres, only where the source gives one. */
  ele: number | null
}

/** Real-map zoom at which each rank starts to show. */
export const RANK_MINZOOM: Record<MapLandmark['rank'], number> = { 1: 0, 2: 9.6, 3: 11 }

export const LANDMARK_COLORS: Record<LandmarkCategory, string> = {
  settlement: '#f7f3ea',
  volcano: '#ff8f66',
  lake: '#5fd4e6',
  island: '#f4d58d',
  temple: '#f2b45a',
}
