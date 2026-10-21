/**
 * Child age band (client decision): children are 3–11, younger than 3 is an
 * infant (free), 12 and over pays the adult price. An activity with no band of
 * its own uses these defaults; a band set in Studio overrides them.
 */

export const DEFAULT_CHILD_AGE_MIN = 3
export const DEFAULT_CHILD_AGE_MAX = 11

export interface ChildAges {
  min: number
  max: number
}

/** The band for an activity: its own when valid, otherwise the defaults. */
export function resolveChildAges(min: number | null, max: number | null): ChildAges {
  if (min !== null && max !== null && max >= min && min >= 0) return { min, max }
  if (min === null && max !== null && max >= DEFAULT_CHILD_AGE_MIN) {
    return { min: DEFAULT_CHILD_AGE_MIN, max }
  }
  if (min !== null && max === null && min <= DEFAULT_CHILD_AGE_MAX && min >= 0) {
    return { min, max: DEFAULT_CHILD_AGE_MAX }
  }
  return { min: DEFAULT_CHILD_AGE_MIN, max: DEFAULT_CHILD_AGE_MAX }
}
