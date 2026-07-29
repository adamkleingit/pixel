# Closest-handle selection for overlapping drag handles

## Problem

On small elements, handle hit targets crowd into the same screen space. The most
painful case: trying to grab a **size (resize) corner** but repeatedly landing on
a **corner-radius** dot (or rotate / padding / margin / gap) instead. Today
disambiguation is static — z-index + DOM paint order + fixed insets — not
“which handle is the pointer actually closest to?”

## Root cause

Selection chrome mounts three overlays (`ResizeHandles`, `SpacingHandles`,
`CornerRadiusHandles`) that all own `pointer-events: auto` hit targets at once:

| Overlay | z-index | Hit size (approx) |
|---------|---------|-------------------|
| Spacing (pad / margin / gap) | 1003 | asymmetric pads around 1×4 bars |
| Resize corners / edges | 1002 | 8×8 corner, 10px-thick edges |
| Rotate | 1002 (under resize) | 22×22 at each corner |
| Corner radius | 1002 | 18×18 (8px dot + 5px pad) |

Crowding mitigations today (`CORNER_INSET = 8`, `MIN_HANDLE_OFFSET = 3`) only
nudge visuals; they do not pick a winner by distance. After the 300ms hover
reveal, spacing (higher z) and radius dots steal the resize corner on small
boxes. Rotation is ignored for spacing/radius (those overlays bail when
`rotation ≠ 0`), but resize/rotate still stack under CSS `transform: rotate`.

## Design

### Closest-handle wins

Introduce a pure hit-scoring module that, on every `pointermove` over the
selection (and while not mid-drag), scores **all currently eligible** handle
candidates and elects one winner. Only the winner is interactive
(`pointer-events: auto`); others become `pointer-events: none`. Optionally
dim non-winners slightly when the box is “crowded” so the active affordance
is obvious.

**Eligible candidates** (same rules as today for when a kind exists):

- Resize: corners + edges from `computeResizeHandles` (current inputs).
- Rotate: all four corners.
- Corner radius: four dots when hover-revealed **and** rotation ≈ 0.
- Padding / margin / gap: when hover-revealed **and** rotation ≈ 0.

**Distance metric:** Euclidean distance from pointer to the handle’s
**screen-space anchor** (or to the nearest point of its hit rect for long
edge bands). Anchors account for:

- Element `Rect` (top/left/width/height) and `rotation` via rotate-about-center
  (same transform as `ResizeHandles`).
- Radius: inward along the corner diagonal by `r·scale + CORNER_INSET`.
- Padding / margin: current bar positions including `MIN_HANDLE_OFFSET`.
- Gap: existing gap-bar midpoints.
- Viewport scale (`getViewportScale`) so CSS-px offsets map to screen px.

**Tie-break** (when distances are within ~1px): prefer the smaller visual
target in this order — radius → padding/margin/gap → resize corner → resize
edge → rotate. Rationale: large bands (rotate/edge) shouldn’t permanently
eclipse tiny dots when the pointer is equidistant.

**During an active drag** of any kind: freeze the winner to that handle; do
not re-score until the drag ends.

**Hover reveal:** keep the existing 300ms delay for spacing/radius chrome.
Proximity scoring only includes those kinds once revealed (or mid-drag).
Resize/rotate remain always present.

### Wiring

1. New pure module `packages/ui/src/drag/handle-proximity.ts`:
   - `HandleCandidate` type (`kind`, `id`, `anchor` / `hit`, optional meta).
   - `buildHandleCandidates(rect, styles, layout, options)` — geometry only.
   - `pickClosestHandle(candidates, pointer, opts?)` — returns winner id or null.
   - Shared constants re-exported or imported from one place where practical
     (do not churn every call site; duplicate numbers OK if commented as paired).

2. New thin coordinator in `Selection.tsx` (`AnchorHandles` or `HandleLayer`):
   - Document `pointermove` → compute candidates → `activeHandleId` state.
   - Pass `activeHandleId` (+ `crowded` boolean if useful) into the three
     overlays.
   - Skip scoring while any resize/rotate/spacing/radius drag is active.

3. Overlay components gate hit targets:
   - `Handles.tsx`, `SpacingHandles.tsx`, `CornerRadiusHandles.tsx` accept
     `activeHandleId: string | null`.
   - Each hit target sets `pointerEvents: activeHandleId === myId ? 'auto' : 'none'`.
   - When `activeHandleId` is null (pointer far from all), fall back to
     today’s behavior **or** leave all non-interactive except within a
     generous outer hit radius — prefer: only enable within a max grab
     distance (e.g. 24px) so far-away pointers don’t light a random handle.

### Out of scope

- Changing resize / rotate / spacing / radius **gesture math**.
- Showing spacing/radius on rotated elements (still suppressed).
- Redesigning handle visuals beyond light dimming of non-winners.

## Files to touch

| File | Change |
|------|--------|
| `packages/ui/src/drag/handle-proximity.ts` | **New** — candidate build + closest pick |
| `packages/ui/src/drag/handle-proximity.test.ts` | **New** — unit coverage |
| `packages/ui/src/Selection.tsx` | Coordinate `activeHandleId` from pointer |
| `packages/ui/src/drag/Handles.tsx` | Gate resize/rotate hit targets by winner |
| `packages/ui/src/drag/SpacingHandles.tsx` | Gate pad/margin/gap by winner |
| `packages/ui/src/drag/CornerRadiusHandles.tsx` | Gate radius dots by winner |
| `e2e/editing-full.spec.ts` or new `e2e/closest-handle.spec.ts` | Crowded small-element scenario |
| `.changeset/<slug>.md` | patch bump (bugfix / UX fix) |

## Test plan

### Unit (`handle-proximity.test.ts`)

- Tiny square (e.g. 24×24): pointer at outer corner → **resize** wins over
  radius when closer to the corner square; pointer inset along diagonal →
  **radius** wins.
- Pointer outside corner but inside rotate band → **rotate** when farther
  from resize/radius anchors.
- Axis-aligned edge midpoints: resize edge vs padding vs margin — winner
  tracks which bar/band the pointer is nearer to (including
  `MIN_HANDLE_OFFSET`).
- Rotated rect (45°): screen anchors rotate correctly; spacing/radius
  candidates omitted when rotation ≠ 0.
- Gap candidates only when flex/grid gap is present in options.
- Tie-break prefers smaller target when distances equal.

### E2e

- Select a small button/card in the example app.
- Hover to reveal radius (and spacing if applicable).
- Move pointer to the outer corner vicinity → assert
  `data-resize-handle="corner"` is the interactive target (or that a corner
  resize drag changes width/height).
- Move pointer inward to the radius dot → assert radius drag changes
  `border-*-radius` instead of size.
- (Optional) padding vs edge on a zero-padding side: edge resize still
  reachable near the border.

## Risks

- **Pointer-event thrash:** rapid winner flips near boundaries. Mitigate with
  a small hysteresis (~2px) so the current winner keeps the win until another
  is clearly closer.
- **E2e flakiness:** existing specs hover then drag by selector; gating
  `pointer-events` may break tests that hit a non-winner. Fix by moving the
  pointer onto the intended handle before `pointerdown`, or by exposing a
  test hook. Audit `editing-full.spec.ts` / `editing.spec.ts` /
  `inline-caret-and-handle.spec.ts`.
- **Perf:** scoring ~20 candidates per move is cheap; keep it pure and
  allocation-light.

## Phasing

Single phase — ship the proximity module + wiring + tests together. No
partial rollout needed; without gating, scoring alone does nothing.
