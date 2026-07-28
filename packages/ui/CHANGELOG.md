# @getpixel/ui

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
