# @getpixel/ui

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

- 1bc508a: Make Pixel usable on Next.js and React 19, and keep it out of production bundles.

  - **Production stripping.** `isEnabled={false}` is only a runtime switch — the static
    import still shipped the whole SDK. New `@getpixel/ui/noop` entry (same exports,
    no behaviour) plus `pixel()` for Vite and `stripInProduction` in `withPixel`
    resolve `@getpixel/ui` to it for production builds.
  - **React 19.** pixel-react now reads the current-owner fiber from either React 18's
    `ReactCurrentOwner` or React 19's `A.getOwner()`, so time-travel works on both.
  - **SSR/hydration.** `<Overlay />` mounts after hydration instead of checking for
    `document`, so prerendering frameworks no longer hit a hydration mismatch (and
    `renderToString` no longer throws on the portal).
  - **StrictMode.** `withPixel` turns `reactStrictMode` off in development, where its
    double-invoke desyncs state capture; pixel-react warns when it renders under one.
  - **Path resolution.** `resolvePixelReactPath` assumed the integrations' own
    directory, which is wrong once tsup hoists shared code into a top-level chunk —
    the Next alias pointed at a nonexistent file. Both entries now resolve from the
    package root.

### Patch Changes

- 1bc508a: Fix the failure toast's **Resend** doing nothing after a failed edit or comment
  save. Resend only ever replayed a pending _recording_, so when the ingest server
  was down while saving edits or comments the toast appeared but its button was
  inert — pressing Save again in the bar was the only way through. Every save path
  now registers how to replay itself, and Resend re-runs the caller's whole save
  flow, so a recovered save also clears the batch and leaves edit/comment mode
  exactly as a first-try Save would. A debounced edit folded into a failed Save is
  also kept in history instead of being dropped, so the retry still carries it.

## 0.4.2

### Patch Changes

- dd089df: Resume live closes the state history pane.

## 0.4.1

### Patch Changes

- 589a586: Fix per-corner radius values invisible in the design pane.

## 0.4.0

### Minor Changes

- dac78eb: Add `@getpixel/ui/next` (`withPixel`) and `@getpixel/ui/vite` (`pixelReactAlias`) bundler helpers so Next.js and Vite apps need only one or two integration calls instead of hand-rolled webpack/Vite alias config.

### Patch Changes

- dac78eb: Require `PIXEL_PROJECT_DIR` when starting the ingest server so design-token extraction always targets the correct app package. Fix Next.js time-travel by aliasing both `react` and Next's compiled/react hook imports through `withPixel`.

## 0.3.0

### Minor Changes

- 95c8dfc: Add comment mode: pin notes on the page, Save as `comments.json` for the agent, with cancel confirms and changelog icon.

## 0.2.0

### Minor Changes

- 7bfee15: Add a packaging smoke test that installs the published tarballs into a clean app and
  verifies the server connects and edits round-trip, plus a CI gate and a changesets-driven
  release pipeline (lockstep versioning, automated version PR + npm publish).
