# AGENTS.md

## Cursor Cloud specific instructions

Pixel is an npm-workspaces monorepo (Node 22+). The dependency-refresh step (`npm ci`
and the Playwright Chromium browser) is handled by the Cloud environment's update
script, so you normally don't need to reinstall anything. The notes below cover the
non-obvious bits of running/testing the code; standard commands live in the root
`package.json` scripts and `README.md`.

### Workspaces / services
- `@getpixel/ui` (`packages/ui`) — in-page React SDK, built with `tsup`. The example
  app consumes its **built `dist/`**, not its source, so the SDK must be built before
  the example (or the app) can run. `npm run dev` handles this: it builds the UI once,
  then runs the UI in `--watch` alongside the server and example.
- `@getpixel/server` (`packages/server`) — Express ingest server. In dev it listens on
  port **41889** and writes recordings/edits to a dropbox at `./.pixel/inbox` (its
  `dev` script points `PIXEL_PROJECT_DIR` at `examples/basic`). Whisper transcription
  runs in-process.
- `@getpixel/example` (`examples/basic`) — Vite demo app on port **5280**. It talks to
  the server at `http://localhost:41889` and is where the SDK is exercised end-to-end.

### Run everything (dev)
- `npm run dev` — builds `@getpixel/ui`, then runs UI watch + server (41889) + example
  (5280) in parallel. Open http://localhost:5280/ .
- To run pieces individually: `npm run ui`, `npm run server`, `npm run example`.

### Lint / test / build
- No ESLint/Prettier lint script exists. The closest static check is per-package
  typecheck: `npm run typecheck -w @getpixel/ui` and `-w @getpixel/server`.
- Unit tests: `npm test` (Vitest, jsdom).
- E2E: `npm run test:e2e` (Playwright, Chromium headless). The Playwright config spins
  up its **own** server + example instances on separate ports, so you do NOT need
  `npm run dev` running first — in fact leaving dev servers up is fine because the e2e
  harness uses `reuseExistingServer: false` and its own ports.
- `npm run build` builds both publishable packages.

### Gotchas
- CI runs on Node 24; local dev works on Node 22. Both are fine.
- A PR that changes anything under `packages/*` must include a Changeset
  (`npx changeset`) or the `changeset` CI job fails (`npx changeset status --since=origin/main`).
- The core user flow to demo/verify: open the example, click the floating Pixel bar's
  Edit (pencil), edit an element (e.g. double-click text) or record a session, then
  Save — the change is written as a task under `.pixel/inbox/<id>/` (`edits.json` +
  `timeline.json`). That dropbox is the product's output.
- `test:pack` (`npm run test:pack`) is a separate packaging smoke test that packs the
  tarballs and installs them into a throwaway app; it uses `playwright.pack.config.ts`.
