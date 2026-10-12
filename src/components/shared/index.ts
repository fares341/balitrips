/**
 * Shared, cross-page UI.
 *
 * Ported from design/handoff/bt-ui.jsx and
 * design/handoff/sections-bt/primitives.jsx. Import from
 * '@/components/shared' rather than reaching for the individual files.
 *
 * Layering: these sit above '@/components/ui' (Icon, Photo, Logo) and below
 * the page sections. Nothing here knows about routing state, the cart or the
 * database — every one of them is driven entirely by props.
 *
 * `stepper`, `accordion`, `modal` and `toast` carry 'use client'; the rest
 * render on the server. Re-exporting them here does not make this barrel a
 * client module, but importing one of them into a Server Component does pull
 * it into the client bundle.
 */

export { Button, LinkButton } from './button'
export type { ButtonProps, ButtonSize, ButtonVariant, LinkButtonProps } from './button'

export { Stepper } from './stepper'
export type { StepperProps, StepperSize } from './stepper'

export { Rating } from './rating'
export type { RatingProps, RatingSize } from './rating'

export { Chip, Tag } from './tag'
export type { ChipProps, ChipVariant, TagProps, TagVariant } from './tag'

export { Breadcrumbs } from './breadcrumbs'
export type { BreadcrumbsProps, Crumb } from './breadcrumbs'

export { SectionHead } from './section-head'
export type { SectionHeadProps } from './section-head'

export { Accordion } from './accordion'
export type { AccordionItem, AccordionProps } from './accordion'

export { Modal } from './modal'
export type { ModalProps } from './modal'

export { ToastProvider, useToast } from './toast'
export type { ToastApi, ToastProviderProps } from './toast'
