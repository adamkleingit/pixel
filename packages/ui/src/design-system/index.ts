/**
 * Pixel design system — public surface.
 *
 * Import everything UI-related from here so the boundary is obvious:
 *
 *   import { Surface, IconButton, Tab, COLORS, FONT_SIZE } from '@/design-system'
 *
 * If you reach for a hex value or duplicate a primitive, that's a signal the
 * design system is missing something — extend it instead of working around it.
 */

export * from './theme'
export * from './icons'
export * from './atoms/Surface'
export * from './atoms/IconButton'
export * from './atoms/Tab'
export * from './atoms/Button'
export * from './atoms/TextInput'
export * from './atoms/Divider'
export * from './molecules/TabStrip'
export * from './molecules/PaneHeader'
export * from './molecules/PaneActions'
export * from './molecules/ResizeBar'
