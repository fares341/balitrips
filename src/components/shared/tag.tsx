/**
 * Tag and Chip.
 *
 * v3: implemented in `@/components/bt/chip` (bt.css "Chips / tags"); this
 * module re-exports them so existing imports from '@/components/shared'
 * keep working.
 */

export { Chip, Tag } from '@/components/bt/chip'
export type { ChipProps, ChipVariant, TagProps, TagVariant } from '@/components/bt/chip'
