/**
 * v3 design-system components (design-reference/prototype, bt.css).
 *
 * Import from '@/components/bt'. Styling lives in src/styles/bt.css; the
 * tokens in src/styles/tokens.css.
 *
 * `fav-button` and `favorites-store` are client modules; importing them into
 * a Server Component makes them client islands, which is intended.
 * Stepper, Breadcrumbs and the toast provider keep living in
 * '@/components/shared' (restyled to v3) and are re-exported here.
 */

export { Button, LinkButton, IconButton, buttonClass } from './button'
export type {
  ButtonProps,
  ButtonSize,
  ButtonStyleProps,
  ButtonVariant,
  IconButtonProps,
  LinkButtonProps,
} from './button'

export { Chip, ChipLink, ChipRow, Tag } from './chip'
export type { ChipLinkProps, ChipProps, ChipRowProps, TagProps, TagVariant } from './chip'

export { SectionHead } from './section-head'
export type { SectionHeadProps } from './section-head'

export {
  Card,
  CardActions,
  CardBody,
  CardFoot,
  CardMedia,
  CardMeta,
  CardText,
  CardTitle,
  PriceFrom,
  Stars,
  formatPrice,
} from './card'
export type {
  CardMediaProps,
  CardMetaItem,
  CardMetaProps,
  CardProps,
  CardRatio,
  CardTitleProps,
  PriceFromProps,
  StarsProps,
} from './card'

export { CompactCard } from './compact-card'
export { StepCards, type StepCardItem } from './step-cards'
export type {
  CompactCardImage,
  CompactCardLayout,
  CompactCardPrice,
  CompactCardProps,
} from './compact-card'

export { FavButton } from './fav-button'
export type { FavButtonProps } from './fav-button'
export {
  FAVORITES_CHANGED_EVENT,
  favoriteKey,
  refreshFavorites,
  setFavorite,
  useFavorites,
} from './favorites-store'
export type { FavoritesState } from './favorites-store'

export { RegionCard, ServiceGrid, ServiceTile } from './tiles'
export type { RegionCardProps, ServiceTileProps } from './tiles'

export {
  Checkbox,
  Field,
  Input,
  InputField,
  Radio,
  Select,
  SelectField,
  Switch,
  Textarea,
  TextareaField,
  fieldDescribedBy,
} from './field'
export type {
  ChoiceProps,
  FieldProps,
  InputFieldProps,
  InputProps,
  SelectFieldProps,
  SelectOption,
  SelectProps,
  SwitchProps,
  TextareaFieldProps,
  TextareaProps,
} from './field'

export {
  Alert,
  CardSkeleton,
  EmptyState,
  ErrorState,
  ListSkeleton,
  Skeleton,
  Unavailable,
} from './states'
export type {
  AlertProps,
  AlertTone,
  EmptyStateProps,
  ErrorStateProps,
  SkeletonProps,
} from './states'

export { Stepper } from '@/components/shared/stepper'
export type { StepperProps, StepperSize } from '@/components/shared/stepper'
export { Breadcrumbs } from '@/components/shared/breadcrumbs'
export type { BreadcrumbsProps, Crumb } from '@/components/shared/breadcrumbs'
export { ToastProvider, useToast } from '@/components/shared/toast'
export type { ToastApi, ToastOptions } from '@/components/shared/toast'
export { TierFilter } from './tier-filter'
export type { TierFilterProps } from './tier-filter'
