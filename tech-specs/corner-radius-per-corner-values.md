# Fix per-corner radius values invisible in the design pane

## Problem

When the **Independent corners** toggle is expanded on the Appearance → Corner
radius row, the four per-corner inputs show only the corner icon and the unit
picker (`px`) — the numeric value is missing. Users cannot see or edit individual
corner radii (e.g. top-left `8`, bottom-right `16`).

## Root cause

Two layout issues combine in the 2×2 per-corner grid:

1. **Cells are too narrow.** The design pane is 280px wide; section content is
   ~256px. The grid uses two equal columns with `paddingRight: 60px` to align
   with the all-corners input above, leaving ~96px per cell. Each cell hosts a
   full `DimensionInput` (numeric field + 52px unit dropdown). After the
   dropdown and gaps, the numeric field gets ~40px — not enough to show a value
   beside the 12px prefix icon.

2. **Token labels steal space.** When a radius is bound to a design token (e.g.
   `rounded`), `NumericInput` lays out `[value group (shrinkable)] [token label
   (flex:1)]`. In a tight cell the token name (`rounded`) expands and the input
   shrinks to `minWidth: 0`, hiding the digits entirely.

The all-corners input works because it spans the full row (~200px).

## Design

1. **`DimensionInput` `compact` mode** — omit the unit dropdown; show the unit as
   a plain suffix on `NumericInput`. Per-corner radii inherit the unit from the
   parsed value (default `px`). Unit changes remain on the all-corners control.

2. **`NumericInput` layout hardening** — never shrink the value group below the
   input's content width when a token label is present; let the token label
   ellipsize instead.

## Files to touch

| File | Change |
|------|--------|
| `packages/ui/src/properties-sidebar/DimensionInput.tsx` | Add `compact?: boolean`; skip dropdown, pass unit suffix |
| `packages/ui/src/properties-sidebar/NumericInput.tsx` | Value group `flexShrink: 0`; input `minWidth` from content |
| `packages/ui/src/properties-sidebar/AppearanceSection.tsx` | Pass `compact` to per-corner `RadiusInput` |
| `packages/ui/src/properties-sidebar/NumericInput.test.tsx` | New — token label + narrow width keeps value visible |
| `packages/ui/src/properties-sidebar/DimensionInput.test.tsx` | Compact mode omits dropdown |
| `e2e/editing-full.spec.ts` | Expand corners, assert values visible + editable |

## Test plan

- **Unit:** render `NumericInput` with `tokenLabel` inside a 80px wrapper; assert
  input value is visible. Render compact `DimensionInput`; assert no unit dropdown.
- **E2e:** select element, set radius `12`, expand independent corners, assert
  four inputs show `12`, edit top-left to `8`, assert `border-top-left-radius: 8px`.

## Risks

- Low. Compact mode is scoped to the per-corner grid; all-corners input unchanged.
- Per-corner unit edits via dropdown removed in compact cells — acceptable because
  the all-corners row retains the unit picker.
