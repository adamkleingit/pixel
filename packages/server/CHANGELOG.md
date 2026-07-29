# @getpixel/server

## 0.5.3

### Patch Changes

- ec23bd4: Pick the closest selection handle under the pointer so size, radius, and spacing stay reachable on small elements.
- 8402754: Show authored `color-mix()` (and other non-hex) backgrounds as a custom value in the Design pane instead of opaque black. Also parse Chrome's resolved `color(srgb …)` form so computed colors don't fall back to `#000000`.

## 0.5.2

### Patch Changes

- 7aa3be0: Document `<PixelStateRoot>` in the install path (README + pixel skill) so fresh installs include the time-travel remount boundary instead of skipping it.

## 0.5.1

### Patch Changes

- 3729c6e: Hide the changelog indicator when the bar is minimized, and add a Hide control on both the expanded and minimized bar that dismisses it while keeping double Space / double Enter hotkeys active.

## 0.5.0

### Minor Changes

- 1bc508a: Extract design tokens from plain CSS custom properties. The `css-vars-fallback`
  adapter previously returned nothing, so any app not using shadcn or Tailwind had
  an empty design pane. It now reads `--name: value` declarations from `:root`,
  `html`, and `:host` blocks, classifies them by name _and_ value (so
  `--z-modal: 100` isn't a colour), and notes any `.dark` / `[data-theme="dark"]`
  override. It still only wins when no library-specific adapter matches.

## 0.4.2

### Patch Changes

- dd089df: Resume live closes the state history pane.

## 0.4.1

### Patch Changes

- 589a586: Fix per-corner radius values invisible in the design pane.

## 0.4.0

### Minor Changes

- dac78eb: Require `PIXEL_PROJECT_DIR` when starting the ingest server so design-token extraction always targets the correct app package. Fix Next.js time-travel by aliasing both `react` and Next's compiled/react hook imports through `withPixel`.

## 0.3.0

### Minor Changes

- 95c8dfc: Add comment mode: pin notes on the page, Save as `comments.json` for the agent, with cancel confirms and changelog icon.

## 0.2.0

### Minor Changes

- 7bfee15: Add a packaging smoke test that installs the published tarballs into a clean app and
  verifies the server connects and edits round-trip, plus a CI gate and a changesets-driven
  release pipeline (lockstep versioning, automated version PR + npm publish).
