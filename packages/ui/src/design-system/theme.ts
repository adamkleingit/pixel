/**
 * Pixel design tokens — TypeScript mirror of theme.css.
 *
 * Use these for inline `style={{ … }}` consumers. CSS-vars (`var(--pixel-…)`)
 * are equally valid; pick whichever reads cleaner at the call site.
 *
 * NEVER hardcode hex values in components. If a color is missing here, add
 * it once and reference the token everywhere.
 */

export const COLORS = {
  bgBase:      '#e8e8e8',
  bgSurface:   '#ffffff',
  bgElevated:  '#f5f5f5',
  bgHover:     '#f0f0f0',
  bgActive:    '#ebebeb',

  // Canvas grid — the dot grid (major, always on) and the pixel grid lines
  // (minor, faded in only when zoomed in far enough; see canvas.md §3.2).
  canvasGridDot:  '#d4d4d4',
  canvasGridLine: 'rgba(0, 0, 0, 0.08)',

  // Spacing handles — Figma-style padding / margin / gap drag bars + their
  // hover band (diagonal stripes) and drag label pill. Padding and gap share
  // the teal accent; margin uses blue so the two are unambiguous at a glance.
  spacingPadding:     '#0d9488',
  spacingPaddingFill: 'rgba(13, 148, 136, 0.18)',
  spacingMargin:      '#3b82f6',
  spacingMarginFill:  'rgba(59, 130, 246, 0.18)',

  border:       '#e0e0e0',
  borderSubtle: '#ebebeb',

  textPrimary:   '#1a1a1a',
  textSecondary: '#4a4a4a',
  textMuted:     '#999999',

  accent:      '#7c3aed',
  accentHover: '#6d28d9',
  accentDim:   'rgba(124, 58, 237, 0.12)',
  accentGlow:  'rgba(124, 58, 237, 0.06)',
  // Selection outline base (single-edit mode and source-tile in multi).
  select:      '#4f46e5',
  // Cross-tile selection match — lighter indigo, dotted; rendered on every
  // tile *other than* the one the user is hovering / selecting in, when the
  // peer tile has an element with the same `data-pixel-id`. Border-style
  // (dotted) keeps it visually distinct from the solid source outline.
  selectMatch: '#818cf8',
  // Selection outline used in multi-edit mode for both the source tile and
  // every peer tile that matched. Darker / saturated so the designer can't
  // miss that an edit will fan out.
  selectMulti: '#3730a3',
  // Hover (element pre-pick) — distinct hue from selection so the designer
  // can read both signals on screen at once. Used by the canvas hover outline
  // and the matching row in the Elements tree (two-way sync). Teal reads as
  // "you are pointing at this" without competing with the indigo selection
  // palette or the orange inner-component tint.
  hoverElement:    '#0d9488',
  hoverElementBg:  'rgba(13, 148, 136, 0.10)',
  // Inner-component boundary tint — see tech-specs/inner-components.md §2.3.
  // Orange so it reads as "different component, edit will land elsewhere"
  // against the indigo selection palette. Used by the hover/selection
  // outline, the component label chip, the element-tree boundary rows, and
  // the Story-pane Child State / Child Props headers.
  innerComponent:    '#ea580c',
  innerComponentBg:  'rgba(234, 88, 12, 0.08)',

  green:  '#16a34a',
  red:    '#dc2626',
  yellow: '#d97706',
  blue:   '#2563eb',
} as const

export const FONTS = {
  ui:   '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const

export const FONT_SIZE = {
  xs:   10,  // labels, badges
  sm:   11,  // secondary UI
  base: 12,  // body, panels
  md:   13,  // section headings
  lg:   14,  // panel titles
  xl:   16,  // page headings
} as const

export const RADIUS = {
  sm: 4,
  md: 6,
  lg: 8,
} as const

export const SHADOW = {
  sm:    '0 1px 2px rgba(0, 0, 0, 0.06)',
  md:    '0 2px 8px rgba(0, 0, 0, 0.08)',
  lg:    '0 4px 24px rgba(0, 0, 0, 0.12)',
  frame: '0 2px 24px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.08)',
} as const

/**
 * Stacking order for chrome vs. canvas overlays.
 *
 * The selection / hover / spacing (padding·margin·gap) / dimension overlays
 * portal to <body> with `position: fixed` and live in the ~998–1003 band
 * (`canvasOverlay`). They're viewport-anchored, so an overlay on an element
 * near the canvas edge would otherwise paint over the side panels or top bar.
 * Chrome (`chrome`) sits above that band so panels and the header are never
 * occluded by a canvas overlay. Floating canvas controls and full-app modals
 * sit above the chrome in turn.
 */
export const Z_INDEX = {
  /** Selection / hover / spacing / dimension overlays portaled over the canvas. */
  canvasOverlay:  1000,
  /** Side panels + top bar — must occlude every canvas overlay. */
  chrome:         1050,
  /** Floating canvas controls (zoom buttons). */
  canvasControls: 1100,
  /** Sidebar dropdowns / popovers — portal to <body>, so they need their own
   *  z-index above the chrome to clear the pane they open from. In the
   *  screenshare host the whole Pixel UI lives in `.screenshare-overlay` at
   *  z 2147483000+, so these body-portaled menus must clear THAT, not the old
   *  ~1050 canvas chrome — otherwise the overlay paints over them and their
   *  clicks land on the pane instead of the menu item. */
  popover:        2147483010,
  /** Full-app modals: setup wizard, inner-component alert. */
  modal:          2147483020,
  /** Top-level transient overlays: shortcuts help. */
  overlay:        2147483030,
} as const

/** Common row/control sizing for the chrome. */
export const SIZES = {
  rowHeight:    28,
  iconButton:   26,
  toolbarH:     40,
  paneHeaderH:  41,
  tabH:         33,
  sectionPadX:  12,
  sectionPadY:  12,
  rowGap:       4,
} as const

export type ColorToken = keyof typeof COLORS
