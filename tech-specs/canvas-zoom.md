# Canvas zoom for the in-app SDK (pixel-desktop parity)

## Problem

`@getpixel/ui` overlays a live host app with selection/edit chrome, but there's no
way to zoom the working app. Designers want browser-style zoom — but scoped to the
**app only**, not the whole page (the Pixel chrome, the recording bar, and the
design pane must stay at 100%). We want:

- Zoom the working app via `transform: scale` (crisp, live DOM — not a bitmap).
- Floating **+ / − / % / reset** controls, bottom-right (like `pixel-desktop`).
- **⌘/Ctrl + wheel** zoom-toward-cursor, **space-drag / middle-drag** pan,
  **⌘+ / ⌘− / ⌘0** keyboard shortcuts.
- A subtle **pixel grid** that fades in once you're zoomed in far enough.
- Every selection box, hover outline, and drag handle (resize / spacing / radius /
  reposition / insertion / snap) tracks the zoom exactly.

`pixel-desktop/packages/canvas` already implements all of this for its tile canvas.
The in-app SDK was *pre-wired* for it — `getViewportScale()` is a coordinate seam
threaded through every overlay/drag calc, currently hardcoded to `1`. This spec
ports the canvas viewport model into the in-app SDK and turns that seam on.

## Current state / why this is tractable

- **The coordinate seam already exists.** `selection/selection-utils.ts:rectOf()`
  and all 7 drag modules read `getViewportScale() || 1` and already multiply layout
  boxes by scale / divide pointer deltas by scale. Overlays are `position: fixed`
  boxes computed from `getBoundingClientRect()`, which **already reflects** an
  ancestor `transform: scale()`. So once the seam returns the live scale and the
  transform sits on an app wrapper, the overlays follow automatically.
- **Two independent seam stubs** exist: `canvas/viewport.ts` (imported by `drag/*`)
  and `selection/viewport.ts` (imported by `selection/*`), both returning `1`. We
  unify them: `canvas/viewport.ts` becomes the real module (with the module-level
  scale mirror); `selection/viewport.ts` re-exports `getViewportScale` from it, so
  there is a single live source of truth.
- **The chrome is already out of the transformed subtree.** `Overlay` portals to
  `document.body` (`.pixel-overlay`, z ~2147483000); the app content is a sibling
  under `PixelStateRoot`. Transforming the app wrapper does **not** create a
  containing block for the body-portaled fixed overlays — so they stay correct.
- **Reference is a near-verbatim port.** `viewport.ts`, `grid.ts`, `ZoomControls.tsx`
  copy over with import-path tweaks. `Maximize2Icon`, `MinusIcon`, `PlusIcon`,
  `COLORS.canvasGridDot/Line`, `Z_INDEX.canvasControls` already exist in-app.

### Structural gap (the crux)

`PixelStateRoot` renders a bare `<Fragment>` — there is **no DOM element wrapping
the working app** to hang the transform on, and the DesignPane docks by setting
`margin-right` on `<html>`. The full-parity version introduces a real clipping
**viewport** around the app and migrates docking to shrink that viewport.

## Design

### DOM structure (dev / `enabled` only; production renders children untouched)

```
host #root
  <PixelProvider>                         (no DOM)
    <PixelStateRoot enabled>              (real React; children use aliased react)
      <div class="pixel-viewport">        clipping window: position:fixed; inset:0
        │                                 overflow:hidden; dot-grid background;
        │                                 gesture target (wheel/space/middle pan)
        ├─ <div class="pixel-pixelgrid">  inset:0; 1px grid; fades in 4×→8×; skip <4×
        ├─ <div class="pixel-world">      position:absolute; top/left:0;
        │     {children  /* the app */}   width/height = viewport client size;
        │                                 transform-origin:0 0;
        │                                 transform: translate(x,y) scale(s)
        └─ <ZoomControls/>                absolute bottom-right; sibling of world
      </div>
    </PixelStateRoot>
    <Overlay/>  → portal to document.body: chrome, Selection, DesignPane (unchanged,
                  all fixed-position, OUTSIDE the transformed world)
```

- **World sizing.** A `ResizeObserver` sets the world's `width`/`height` to the
  viewport's client size, so at `scale 1` the world exactly fills the window and the
  app lays out responsively into the available canvas area (matches today). Zoom in
  → world larger than window → pan to explore; zoom out → world smaller → app shrinks
  with grid canvas around it. World `min-height: 100%` so taller apps stay reachable
  by panning.
- **Why the app is fixed-size and *scaled* (not re-laid-out):** this is exactly
  "browser zoom" — the app renders at one logical size and we scale the pixels, so
  text stays crisp (live DOM) and layout is stable across zoom levels.

### New module: `packages/ui/src/canvas/`

Ported from `pixel-desktop/packages/canvas/src/canvas/`:

- **`viewport.ts`** — replace the stub with the real pure model: `Viewport {x,y,scale}`,
  `MIN_SCALE 0.1`, `MAX_SCALE 16`, `clampScale`, `zoomAt` (anchor-pinned Figma zoom),
  `zoomToAt`, `panBy`, the module-level scale mirror (`getViewportScale` /
  `setViewportScale`), and `VIEWPORT_CHANGE_EVENT = 'pixel-viewport-change'`.
- **`useViewport.ts`** — owns `Viewport` state, wheel (⌘/ctrl → zoom-to-cursor via
  `Math.exp(-deltaY*0.0045)`; plain wheel → pan), space-arming + space/middle pointer
  pan, `zoomIn`/`zoomOut` (center-anchored `ZOOM_STEP 1.2`), `reset`. Effect mirrors
  scale into the module and dispatches `VIEWPORT_CHANGE_EVENT`. Adds ⌘+/⌘−/⌘0 key
  handlers (not in the reference — small addition calling the existing
  `zoomIn/zoomOut/reset`).
- **`grid.ts`** — `dotGridStyle(vp)` (always-on major dots, `DOT_SPACING 24`),
  `pixelGridStyle(vp)` + `pixelGridOpacity(scale)` (minor 1-px grid, fade 4×→8×).
- **`ZoomControls.tsx`** — floating Surface/IconButton widget; % label doubles as
  reset-to-100%, Maximize2 = reset view.
- **`CanvasViewport.tsx`** *(new, in-app only)* — the wrapper component that renders
  the viewport/pixelgrid/world/ZoomControls structure, calls `useViewport`, applies
  the grid styles and transform, and observes its own size for the world. Rendered by
  `PixelStateRoot` when `enabled`.
- **`usePersistedState`** — the reference persists the viewport across reload via a
  `storage` module the in-app SDK doesn't have. v1 uses a tiny local
  `usePersistedState` (localStorage, key `pixel:viewport`, SSR-safe) kept inside the
  canvas module. Falls back to in-memory if storage throws.
- **`isTypingEvent`** — the reference imports one from `keyboard/shortcuts` (absent
  in-app). Inline a small helper: composed-path check for `input`/`textarea`/`select`
  / `contenteditable` so space-pan and ⌘0 don't fire while typing in the app or our
  own panes.

### Seam unification

`canvas/viewport.ts` holds the live mirror. `selection/viewport.ts` becomes:

```ts
export { getViewportScale } from '../canvas/viewport'
```

So `drag/*` (already importing `canvas/viewport`) and `selection/*` share one live
scale. No other selection/drag code changes — they were written scale-aware.

### Overlay re-measure

Overlays (`Selection.tsx` `Outline`/`useTrackedRect`) already re-measure on `rAF`,
so they pick up zoom automatically. For efficiency + correctness at rest, add a
`VIEWPORT_CHANGE_EVENT` listener alongside their existing `scroll` listener so a
transform change (which fires no native `scroll`) triggers an immediate re-measure.

### DesignPane docking migration (crux)

Today `DesignPane` sets `document.documentElement.style.marginRight = width`. Migrate
to shrinking the **viewport** instead:

- The viewport width is driven by a CSS var `--pixel-dock-right` (already set by
  DesignPane) — `CanvasViewport` reads it so `right = var(--pixel-dock-right, 0)`.
  DesignPane keeps owning the var + collapse/resize; it stops touching `<html>`
  `margin-right`. The world's `ResizeObserver` reflows the app into the narrower
  canvas, preserving today's "app moves beside the pane" result — now via the
  viewport, not the document margin.
- The floating bar already dodges the pane via `--pixel-dock-right`; unchanged.

## Files touched

**New**
- `packages/ui/src/canvas/useViewport.ts`
- `packages/ui/src/canvas/grid.ts`
- `packages/ui/src/canvas/ZoomControls.tsx`
- `packages/ui/src/canvas/CanvasViewport.tsx`
- `packages/ui/src/canvas/persisted-state.ts` (`usePersistedState`)
- `packages/ui/src/canvas/viewport.test.ts`, `grid.test.ts` (port the reference tests)
- `packages/ui/src/canvas/CanvasViewport.test.tsx` (wrapper behavior)
- `e2e/canvas-zoom.spec.ts`

**Modified**
- `packages/ui/src/canvas/viewport.ts` — stub → real model.
- `packages/ui/src/selection/viewport.ts` — re-export from `canvas/viewport`.
- `packages/ui/src/pixel-react/PixelStateRoot.tsx` — wrap children in `CanvasViewport`
  when `enabled` (Fragment path unchanged for `enabled=false`).
- `packages/ui/src/Selection.tsx` — add `VIEWPORT_CHANGE_EVENT` re-measure listener.
- `packages/ui/src/DesignPane.tsx` — dock via `--pixel-dock-right` / viewport shrink
  instead of `<html>` margin-right.
- `packages/ui/src/styles.ts` — `.pixel-viewport` / `.pixel-world` / `.pixel-pixelgrid`
  classes.
- `packages/ui/src/index.ts` — export `CanvasViewport` / zoom types if the public
  surface needs it (TBD — may stay internal to `PixelStateRoot`).
- `README.md` — document zoom + shortcuts.

## Test plan

**Unit (Vitest)**
- `viewport.test.ts` — `zoomAt` keeps the anchor pinned; clamps at MIN/MAX with the
  anchor still pinned; `panBy`; `zoomToAt`; scale-mirror get/set.
- `grid.test.ts` — `pixelGridOpacity` ramp (0 below 4×, 1 at/above 8×, linear
  between); `dotGridStyle`/`pixelGridStyle` size/position math; `null` below fade.
- `CanvasViewport.test.tsx` — renders children inside `.pixel-world`; `zoomIn` raises
  the scale + updates `getViewportScale()`; `reset` returns to 100%; dispatches
  `VIEWPORT_CHANGE_EVENT` on change; pixel-grid layer absent below 4×, present above.
- A seam test: after `setViewportScale(2)`, `selection/viewport` `getViewportScale()`
  returns `2` (unification holds).

**e2e (Playwright, `e2e/canvas-zoom.spec.ts`)**
- Zoom controls visible; clicking **+** scales the app up (`.pixel-world` transform
  matrix scale > 1) and the % label updates; **reset** returns to 100%.
- With an element selected in edit mode, zoom in and assert the selection outline
  (`.pixel-sel`) still hugs the element (its box ≈ the element's
  `getBoundingClientRect()` at the new scale) — proves overlays track zoom.
- ⌘/Ctrl+wheel over the app zooms toward the cursor; ⌘0 resets.
- Pixel grid: at high zoom the `.pixel-pixelgrid` layer has non-zero opacity.
- DesignPane: opening the pane shrinks the viewport (app reflows beside it) and the
  chrome/controls stay at 100%.

## Risks

1. **DesignPane migration** is the riskiest change — it alters how the app reflows
   beside the pane (viewport-shrink vs `<html>` margin). Existing `design-pane-*`
   e2e specs and `settleLayout` must stay green; watch for reflow-timing regressions.
2. **World scroll semantics** — apps relying on document-level scroll now scroll
   inside the viewport/world. World `min-height:100%` + pan keeps tall content
   reachable; verify the example app and note the nuance. Not changing the app's own
   internal scroll containers.
3. **Wheel capture** — the non-passive `window` wheel listener must gate on
   over-canvas / over-handle (per the reference) so sidebar/popover scroll and normal
   page scroll without a modifier are untouched.
4. **Nested transforms** — `rectOf` assumes the only scaling ancestor is the world;
   an app with its own internal `transform: scale` on a selected subtree would
   double-count. Pre-existing assumption; documented, not addressed here.
5. **Persistence** — a persisted zoom could confuse a returning user ("why is my app
   tiny?"). Mitigate: `reset` is one click / ⌘0, and persistence is per-origin
   localStorage. Could gate persistence off if it surprises in testing.

## Build order (one PR; each step compiles + tests pass)

1. Port pure `viewport.ts` + unify the seam + `viewport.test.ts`. (No visible change.)
2. `grid.ts` + `usePersistedState` + `useViewport.ts` (gestures, ⌘ shortcuts).
3. `CanvasViewport.tsx` + `ZoomControls.tsx` + styles; wire into `PixelStateRoot`.
   Zoom becomes visible; overlays track via the existing seam + rAF.
4. `Selection.tsx` `VIEWPORT_CHANGE_EVENT` re-measure listener.
5. DesignPane docking migration.
6. Tests (unit + e2e), README, changeset (minor — additive capability), demo media.
