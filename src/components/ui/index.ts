/**
 * UI primitives.
 *
 * Ported from design/handoff/sections-bt/primitives.jsx. Import from
 * '@/components/ui' rather than reaching for the individual files.
 *
 * Note that `photo.tsx` carries 'use client'; re-exporting it here does not
 * make the barrel a client module, but importing `Photo` into a Server
 * Component does pull it into the client bundle. That is intended — the error
 * fallback needs a handler.
 */

export { Icon, iconNames, isIconName, type IconName, type IconProps } from './icon'
export { Photo, type PhotoProps } from './photo'
export { Logo, type LogoProps } from './logo'
