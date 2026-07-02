# Pixel Design System

The chrome of Pixel — every sidebar, toolbar, and pane primitive — lives
here. See `design-guidelines.md` for the rules that govern how to use it.

## Layout

```
design-system/
├── design-guidelines.md     ← rules every chrome component must follow
├── README.md                ← this file
├── theme.css                ← CSS variables (loaded once by main.tsx)
├── theme.ts                 ← TypeScript mirror for inline-style consumers
├── icons.tsx                ← lucide-style stroke icons
├── atoms/                   ← presentational, pure, controlled
│   ├── Surface.tsx          → panel container
│   ├── IconButton.tsx       → square icon-only button
│   ├── Tab.tsx              → single tab in a strip
│   ├── Button.tsx           → text action button (primary / secondary)
│   ├── TextInput.tsx        → single-line input
│   └── Divider.tsx          → 1px line, h or v
├── molecules/               ← composed primitives, still presentational
│   ├── TabStrip.tsx         → row of <Tab>s
│   ├── PaneHeader.tsx       → 41px sidebar header bar
│   ├── PaneActions.tsx      → minimize + detach action group
│   └── ResizeBar.tsx        → 4px draggable strip
└── index.ts                 ← public surface
```

## Tokens

| Group     | Examples                                                  |
| --------- | --------------------------------------------------------- |
| Surfaces  | `bgBase`, `bgSurface`, `bgElevated`, `bgHover`, `bgActive`|
| Borders   | `border`, `borderSubtle`                                  |
| Text      | `textPrimary`, `textSecondary`, `textMuted`               |
| Accent    | `accent`, `accentHover`, `accentDim`, `accentGlow`        |
| Semantic  | `green`, `red`, `yellow`, `blue`                          |
| Type      | `FONTS.ui`, `FONTS.mono`; `FONT_SIZE.xs` … `FONT_SIZE.xl` |
| Radii     | `RADIUS.sm` (4) / `md` (6) / `lg` (8)                     |
| Shadows   | `SHADOW.sm` / `md` / `lg` / `frame`                       |
| Sizes     | `SIZES.toolbarH`, `paneHeaderH`, `tabH`, `rowHeight`, …   |

## Adding to the system

1. Need a new color or size? Add it once to `theme.css` **and** `theme.ts`
   under the same name.
2. Need a new icon? Add it to `icons.tsx` using the `Icon` wrapper so it
   inherits the standard 24×24 viewBox + 1.6 stroke style.
3. Need a new primitive? Pick the right folder:
   - **atom** — no state beyond hover; takes props, renders markup
   - **molecule** — composes atoms, may forward callbacks
   - **organism / panel** — feature-specific, lives outside this folder
4. Every primitive gets a top-of-file doc comment explaining what it is and
   when to use it. See existing files for the format.
