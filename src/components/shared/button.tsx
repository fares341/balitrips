/**
 * Button and LinkButton.
 *
 * v3: the implementation moved to `@/components/bt/button` (the package's
 * `.btn` family). This module re-exports it so the existing call sites —
 * `variant="orange" | "forest" | "ghost" | "light"`, `size="sm" | "md" | "lg"`,
 * `block` — keep compiling and pick up the new look.
 */

export { Button, LinkButton } from '@/components/bt/button'
export type {
  ButtonProps,
  ButtonSize,
  ButtonVariant,
  LinkButtonProps,
} from '@/components/bt/button'
