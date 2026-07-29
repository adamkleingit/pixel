---
"@getpixel/ui": minor
---

Make Pixel usable on Next.js and React 19, and keep it out of production bundles.

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
