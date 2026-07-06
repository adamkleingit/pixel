/**
 * Properties-sidebar token shim.
 *
 * Historical: each panel kept its own dark-theme COLORS map. The
 * design system (`@/design-system`) is now the single source of truth, and
 * these names are mapped onto its light-theme tokens. Existing consumers
 * keep working without churn; new code should import directly from
 * `../design-system` instead.
 */

import { COLORS as DS } from '../design-system/theme'

// Stacking-order tokens are theme-wide; re-export so sidebar popovers (which
// portal to <body>) can layer above the chrome without a second import path.
export { Z_INDEX } from '../design-system/theme'

export const COLORS = {
  panel:       DS.bgSurface,
  border:      DS.border,
  divider:     DS.borderSubtle,
  input:       DS.bgElevated,
  inputHover:  DS.bgHover,
  inputActive: DS.bgActive,
  text:        DS.textPrimary,
  muted:       DS.textMuted,
  label:       DS.textMuted,
  accent:      DS.accent,
  accentLight: '#a78bfa',
} as const

export const SIZES = {
  rowHeight:   28,
  iconButton:  26,
  sectionPadX: 12,
  sectionPadY: 12,
  rowGap:      4,
} as const
