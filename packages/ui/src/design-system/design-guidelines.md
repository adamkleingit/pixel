# Pixel Design Guidelines

These rules govern the **chrome** of Pixel — sidebars, toolbars, panes, and
overlays. They do **not** govern the user's project rendered inside the canvas
tile (that lives in its own shadow root and uses the project's own CSS).

## 1. Use the design system

- Import primitives from `@/design-system` — `Surface`, `IconButton`, `Tab`,
  `Button`, `TextInput`, `Divider`, `TabStrip`, `PaneHeader`, `PaneActions`,
  `ResizeBar`.
- Read colors and sizes from `COLORS`, `FONT_SIZE`, `RADIUS`, `SHADOW`, `SIZES`
  in `design-system/theme.ts`. CSS variables (`var(--pixel-…)`) are an equally
  valid alternative — pick whichever reads cleaner at the call site.
- **Never hardcode hex values, font sizes, or pixel paddings** in chrome
  components. If a token is missing, add it once to `theme.ts` /
  `theme.css` and use it everywhere.
- Icons live in `design-system/icons.tsx`. Add new ones there rather than
  inlining SVG markup in components.

## 2. Visual identity

Pixel's chrome is **light, calm, and minimal** — Figma-like. The actual
designs the user is working on are the visually loud thing on screen; the
chrome is plumbing.

- Surfaces: white panels (`--pixel-bg-surface`) on a soft gray canvas
  (`--pixel-bg-base`).
- Borders: hairline, `--pixel-border` (1px) at pane boundaries, subtle
  (`--pixel-border-subtle`) inside panes.
- Accent: Pixel purple `#7c3aed`. Used sparingly — selection, active
  affordances, primary CTAs. Never a flat purple background — use
  `--pixel-accent-dim` for surfaces.
- Type: Inter, 12px body. 11px secondary, 13px headings. Tight letter
  spacing on titles (`-0.01em`), slight tracking on labels (`0.02em`).

## 3. Composition rules

- **Atoms are pure and controlled.** No state, no context, no side effects.
  Take props in, render markup out. Hover state is the one allowed exception.
- **Molecules compose atoms.** They may layout and forward callbacks, but no
  data fetching, no globals, no business logic.
- **Organisms (panels)** live outside `design-system/` — under their feature
  folder (e.g. `left-sidebar/`, `properties-sidebar/`). They consume design
  system primitives.
- One component per file. Filename matches the component name. Export the
  prop type as `<Name>Props`.

## 4. Interaction conventions

- Hover targets get a `--pixel-bg-elevated` background and shift text from
  `--pixel-text-muted` → `--pixel-text-secondary`.
- Active selection uses `--pixel-bg-active` (background) **or** the accent
  underline (1.5px on tabs and canvas page tabs).
- Transitions are short and ignorable: `0.1s` for color/background, `0.12s`
  for borders. No spring physics in chrome.
- Focused inputs draw a 3px `--pixel-accent-dim` halo and an accent border;
  no other ring styles.

## 5. When in doubt

- Look at the prototype (`/prototype/`) — it is the visual spec.
- Read the existing primitives in `design-system/` before writing new ones.
- Prefer reusing an existing primitive with new props over a one-off
  inline-styled element.
