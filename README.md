# Pixel - the missing visual layer of coding agents

Pixel lets you edit your user interface visually:
1. Figma style inline editing, multi select, undo/redo, snap to design tokens and all the features you can dream of
2. Record your screen, point, click, draw on the screen and talk with your agent
3. Leave inline comments

These are all automatically handled by your coding agent without any copy-pasting

## Instructions for human:
Simply copy-paste this into your existing coding agent:

```
Install and setup Pixel by following this guide:  
https://github.com/adamkleingit/pixel#installation
```

Your agent will guide you through the installation.  
After it's done - you will have an onboarding wizard inside your app/storybook


## Installation instructions for agents (and brave humans):
First install @getpixel/ui and @getpixel/server in your codebase, and add to your package.json  

Using npm/yarn/bun:
```bash
npm install @getpixel/ui @getpixel/server
yarn add @getpixel/ui @getpixel/server
bun install @getpixel/ui @getpixel/server
```

Then add the provider, remount boundary, and overlay to your app:
```tsx
import { PixelProvider, PixelStateRoot, Overlay, httpSink } from '@getpixel/ui'

// Pixel is a dev-time tool — gate it on your bundler's dev flag. Vite:
// import.meta.env.DEV. Webpack/CRA/Next: process.env.NODE_ENV !== 'production'.
const enabled = import.meta.env.DEV

export function Root() {
  return (
    <PixelProvider
      isEnabled={enabled}
      config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}
    >
      {/* Remount boundary for time travel (States pane). Keep Overlay outside. */}
      <PixelStateRoot enabled={enabled}>
        <YourApp />
      </PixelStateRoot>
      {enabled && <Overlay />}
    </PixelProvider>
  )
}
```

`isEnabled={false}` makes the provider completely inert — no styles, no keyboard
shortcuts, no event capture, and `start()` does nothing. Render `<Overlay />`
behind the same flag so the floating bar is dev-only too. `<PixelStateRoot>` is
required for the States pane — without it, clicking a captured state can't remount
the tree to freeze the UI to that frame.

Then add the bundler plugin, below — **the runtime flag alone does not keep Pixel
out of your production bundle.**

### Keep Pixel out of your production bundle

`isEnabled={false}` is a *runtime* switch. The `import` above is still static, so
your bundler has no way to know the flag is constant and the whole SDK (~550 KB
unminified) stays in the graph and ships. Point `@getpixel/ui` at its inert build
for production instead — same exports, same shapes, no behaviour — and the SDK
drops out entirely while every import site keeps compiling.

Vite (`vite.config.ts`):

```ts
import { resolve } from 'node:path'
import { pixel } from '@getpixel/ui/vite'

export default defineConfig({
  plugins: [pixel({ appDir: resolve(__dirname, 'src') }), react()],
  optimizeDeps: { include: ['@getpixel/ui/pixel-react'] },
})
```

Next.js (`next.config.ts`):

```ts
import type { NextConfig } from 'next'
import { withPixel } from '@getpixel/ui/next'

const nextConfig: NextConfig = {
  // your existing config…
}

export default withPixel(nextConfig, { rootDir: __dirname, appDir: 'src' })
```

Both helpers also wire up the [time travel](#time-travel--state-history-pixel-react)
bundler alias in development; you still need `<PixelStateRoot>` around app content
(see the snippet above). `withPixel` additionally turns `reactStrictMode` off in
dev (see [StrictMode](#strictmode), below). Pass `stripInProduction: false` /
use `pixelReactAlias()` alone to opt out of the production swap.

On another bundler, alias the package yourself for production builds:

| from | to |
|---|---|
| `@getpixel/ui` | `@getpixel/ui/noop` |

Verify it worked by grepping a production build for `pixel-overlay` — a correctly
configured build has no match.

### Next.js specifics

Pixel is a client-side tool, so the provider and overlay belong in a **client
component**. In the App Router, put them in a `"use client"` file and render it
from `app/layout.tsx`:

```tsx
// app/pixel-root.tsx
'use client'

import { PixelProvider, PixelStateRoot, Overlay, httpSink } from '@getpixel/ui'
import type { ReactNode } from 'react'

const enabled = process.env.NODE_ENV !== 'production'

export function PixelRoot({ children }: { children: ReactNode }) {
  return (
    <PixelProvider
      isEnabled={enabled}
      config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}
    >
      <PixelStateRoot enabled={enabled}>{children}</PixelStateRoot>
      {enabled && <Overlay />}
    </PixelProvider>
  )
}
```

The overlay is safe to render during SSR — it portals into `document.body`, which
has no server-rendered counterpart, so it deliberately mounts only after
hydration and contributes nothing to the server HTML.

### Defer dev-server HMR during a session (recommended)

Add one line to your app **entry** (the file where you `createRoot(...).render(...)`)
so a hot-reload can't wipe an in-progress edit or end a recording mid-session:

```tsx
import { installHmrGuard } from '@getpixel/ui'

// Vite: while a Pixel edit/recording session is active, hot updates (react-
// refresh) and full reloads are deferred and applied as one reload when the
// session ends. No-op in production.
if (import.meta.hot) installHmrGuard(import.meta.hot)
```

Why it matters: without this, saving a file (or the agent writing your edits back
to source) triggers Vite HMR — a react-refresh update re-renders off source and
**discards the in-DOM edits you're making**, and a full reload resets the clock
and drops the mic, **ending any recording**. The guard holds HMR back until you
**Save** or **Cancel**, then reloads once so the latest source lands cleanly.

> Vite only — `import.meta.hot` is Vite's HMR API. On webpack/CRA the equivalent
> is `module.hot`; wire your own hook using the exported `shouldDeferHmr()`
> primitive (returns true while a session is active — decline/defer the update),
> which the provider drives the same way.

### Install the Pixel skills into your coding agent

Pixel ships its agent instructions as **skill files** inside the installed
package — they work with any coding agent (Claude Code, Cursor, Codex, …), you
just drop them wherever your agent loads reusable instructions from:

```
node_modules/@getpixel/server/skill/pixel/SKILL.md        # start + watch loop
node_modules/@getpixel/server/skill/stop-pixel/SKILL.md   # stop watching
```

The simplest way is to let your agent install them. Paste this into your coding
agent:

```
Install the Pixel skills for this project. They ship in the installed package at
node_modules/@getpixel/server/skill/ — two subfolders, `pixel` and `stop-pixel`,
each with a SKILL.md. Copy each subfolder into wherever you load skills / rules /
custom instructions from, keeping the folder name. For example:
  • Claude Code → .claude/skills/<name>/SKILL.md (or ~/.claude/skills for global)
  • Cursor → .cursor/rules/<name>.md
  • otherwise → your agent's equivalent instructions directory
After copying, I should be able to trigger them with "pixel" and "stop pixel".
```

> **Claude Code shortcut:** `npx @getpixel/server install-skill` copies both
> skills into `.claude/skills/` for you (add `--global` for `~/.claude/skills`).

## Running
1. Send **"pixel"** (or "start pixel") to your coding agent
2. Start recording by double-tapping **Space** inside your app
3. Describe your changes. Single **Space** to pause/resume, double **Space** to finish, **Esc** to cancel
4. Your agent will do the rest

### Configuration

SDK (`PixelProvider` `config` prop):

```tsx
<PixelProvider
  config={{
    sink: httpSink('http://localhost:41789'),
    language: 'english',        // transcription hint; defaults to browser locale in the example
    passthrough: false,        // initial tool: false = mouse tool on (inert + draw), true = no tool (clicks pass through)
    stopDelayMs: 500,          // keep recording this long after Stop
    bar: {
      always: true,            // show the bar even when idle (with a Record button). Default false
      position: 'center-right',// see below. Default 'center-right'
      opacity: 0.3,            // 0–1, full on hover. Default 0.3
    },
  }}
/>
```

**Floating bar** — always-on (`bar.always`) shows a Record button while idle and the
full controls (pause/resume, stop, cancel, the live **mouse-tool** toggle) while
recording. A **−/＋** button minimizes/expands it. Positions:

| | left | center | right |
|---|---|---|---|
| **top** | `top-left` | `top-center` | `top-right` |
| **center** | `center-left` ↕ | — | `center-right` ↕ (default) |
| **bottom** | `bottom-left` | `bottom-center` | `bottom-right` |

`center-left` / `center-right` lay the bar out **vertically**. Opacity defaults to
30% and animates to 100% on hover.

The **mouse tool** (on by default) makes the page inert so you can annotate:
**drag** to box a region, or **Cmd+drag** to sketch a freehand stroke — both are
captured as screenshots for the agent. Toggling the tool off is passthrough
(clicks reach the page and are still recorded, but rectangles/strokes are
disabled). Toggle it live from the bar, with the **`M`** key while recording, or
via `usePixel().setPassthrough(...)`; pausing always makes the page live.

Server (env vars):
- `PIXEL_PROJECT_DIR` (**required**) — directory containing your app's design-token
  sources (`package.json`, `globals.css`, `tailwind.config`, `@theme` CSS, …).
  The server **refuses to start** without it. In a monorepo, point at the app
  package — not the repo root — e.g. `PIXEL_PROJECT_DIR=packages/client`.
- `PIXEL_PORT` (default `41789`)
- `PIXEL_DIR` (default: `.pixel/` at the workspace root)
- `PIXEL_TRANSCRIBE` (`0` to disable transcription)
- `PIXEL_WHISPER_MODEL` (default `Xenova/whisper-base`)
- `PIXEL_WHISPER_LANG` — spoken language, e.g. `english`. **Unset → Whisper
  defaults to English**, so set this if you narrate in another language.
- `PIXEL_WHISPER_TASK` — `transcribe` (default) or `translate` (→ English).

Start the server with `PIXEL_PROJECT_DIR` set:

```bash
# single-package app (run from the app root)
PIXEL_PROJECT_DIR=. npx @getpixel/server

# monorepo — point at the package that owns the UI + design tokens
PIXEL_PROJECT_DIR=packages/client npx @getpixel/server
```

> **Using a component workbench?** See [Using Pixel with Storybook](#using-pixel-with-storybook) —
> recordings keep running across story switches.

## Using Pixel with Storybook

Pixel works great for narrating changes against individual components in Storybook,
and a recording **keeps running as you switch stories** — so you can record one
brief that spans several of them.

**1. Run the server** (same as any other app):

```bash
PIXEL_PROJECT_DIR=. npx @getpixel/server      # writes ./.pixel/inbox/<id>/, listens on http://localhost:41789
```

**2. Add a dev-only decorator** in `.storybook/preview.tsx`. The `import.meta.env.DEV`
gate ensures the static `build-storybook` output never ships Pixel:

```tsx
import { Overlay, PixelProvider, PixelStateRoot, httpSink } from '@getpixel/ui'
import type { Decorator } from '@storybook/react'

const withPixel: Decorator = (Story) => {
  if (!import.meta.env.DEV) return <Story />
  return (
    <PixelProvider config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}>
      <PixelStateRoot enabled>
        <Story />
      </PixelStateRoot>
      <Overlay />
    </PixelProvider>
  )
}

export default { decorators: [withPixel] }
```

Then **double-tap Space** in the canvas to start recording.

**Continuity across story switches.** Switching stories tears down and rebuilds the
decorated subtree, which would normally discard the in-progress recording. Pixel
parks the live recording on a `globalThis` singleton that the rebuilt decorator
re-adopts, so audio and event capture continue uninterrupted — `Stop` produces a
single continuous recording spanning every story you visited.

**The one limitation.** A full reload of the preview iframe **ends the recording** —
that's Storybook's HMR after you edit a file, or a manual canvas refresh. A document
reload resets the clock and drops the live mic stream, which can't survive it (exactly
like a hard refresh in any app). Everything short of a reload is preserved.

**Local dev only.** This is a development tool — gate it behind `import.meta.env.DEV`
(as above) and never ship it to a production app or a published/static Storybook.

## Packages

- **`@getpixel/ui`** — in-page React SDK: an overlay you mount once,
  double-tap **Space** to start/stop. It records:
  - **audio** (mic) + **pointer movement** + **clicks** on one timeline;
  - on each **click**, a purple radar blip and the **DOM ancestor chain** of the
    clicked element (tag · id · classes · text), outermost → innermost;
  - on a **drag**, a **rectangle** (`x,y,width,height` + start/end timestamps) and
    a **screenshot of the region** — expanded by 100px of context with the drawn
    rectangle on top (DOM rasterization, no screen-share permission);
  - a **full-viewport screenshot with a coordinate grid** (every 50px) at start
    and on each resume, for spatial context.
  - Two modes: **block** (default — page is inert; clicks/typing recorded but the
    app doesn't react) or **passthrough** (page stays interactive). Pausing always
    makes the page live.
- **`@getpixel/server`** — standalone Node server (runnable as `npx @getpixel/server`)
  that receives two kinds of **tasks** and writes each into a `.pixel/inbox/<id>/`
  dropbox on disk:
  - **recordings** (POST `/recordings`) — **transcribed with Whisper** (Transformers.js
    + a bundled ffmpeg, fully local) into `transcript.json`, then merged into a
    time-ordered `timeline.json`;
  - **saved edits** (POST `/edits`) — a batch of direct UI changes from edit mode,
    written as `edits.json` (no transcription).

  It also extracts the project's **design tokens** for the in-app design pane
  (`GET /tokens`) — see below. The bundled **`pixel` skill** drives the agent
  side: claim a task, recognize its kind, and carry it out.
- **`examples/basic`** (`@getpixel/example`) — a Vite React app that consumes
  `@getpixel/ui` as a published (built) package.

## On-disk task layout

A **recording** task:

```
.pixel/inbox/<id>/
  meta.json         id, startedAt, durationMs, counts
  events.json       pointer / click (+ target chain) / rect / draw events, on one t-clock
  audio.webm        mic audio (omitted if mic denied)
  transcript.json   Whisper output: { text, segments:[{start,end,text}], language }
  timeline.json     merged brief: { frames[], beats[] } (speech/silence beats)
  snaps/
    frame-*.png     full-viewport screenshots w/ coordinate grid (start/resume)
    snap-*.png      region screenshots (100px padding + drawn rectangle)
    draw-*.png      freehand-stroke screenshots (Cmd+drag, stroke drawn on top)
```

A **saved-edit** task (no audio/beats — the brief is the change list):

```
.pixel/inbox/<id>/
  meta.json         id, kind: "edit", changeCount, url
  edits.json        { url, createdAt, changes:[{ target[], kind, name, before, after, source? }] }
  timeline.json     readiness marker (so the same watch/claim pipeline picks it up)
```

## Inline Figma-style editing of the user interface

Mount the SDK and click the **pencil** in the bar (or double-tap **Enter**) to
enter **edit mode**: select elements on the page and move / resize / restyle /
retype them directly on the live DOM, with a Figma-style design pane (its
color/spacing/radius pickers and drag-snap are bound to the project's real design
tokens). **Save** (the disk button, or double-tap **Enter**) sends the batch to
the server as an `/edits` task; **Cancel** (X, or **Esc**) asks for confirmation
when there are unsaved edits, then reverts and exits. Saved edits land in the
dropbox alongside recordings, and the agent applies them to source — preferring
the **symbolic token form** (e.g. `bg-primary`, `var(--brand-coral)`) over a raw
value when a change was bound to a design token.

### Where design tokens come from

The server picks one adapter for the project at `PIXEL_PROJECT_DIR`, re-running
it whenever a watched file changes. The first match wins:

| adapter | detected by | tokens spelled as |
|---|---|---|
| **shadcn/ui** | `globals.css` declaring `--background`, `--foreground`, `--primary` | `bg-primary`, `rounded-md`, else `var(--…)` |
| **Tailwind v4** | `tailwindcss@4` + an `@theme { … }` block | `bg-brand`, `text-lg`, `rounded-lg`, … |
| **Tailwind v3** | `tailwindcss@3` + a `tailwind.config.*` | utilities derived from the config's `theme` |
| **CSS variables** | any `--name: value` in a `:root` / `html` / `:host` block | `var(--name)` |

The last one is the general case: hand-rolled custom properties are picked up as
tokens with no configuration, classified by name and value (so `--z-modal: 100`
is a z-index, not a colour) and annotated with their `.dark` /
`[data-theme="dark"]` override where there is one. A project with no custom
properties at all yields no tokens, and the pickers fall back to raw values.

## Comments — pin notes for the agent

Click the **speech-bubble** icon in the bar (just below the pencil) to enter
**comment mode**. Click anywhere on the page to drop a pin, type a note, and
edit or delete pins before **Save**. Each pin carries the same DOM element
`target` chain as a recording click. **Save** posts the batch to `/comments`
(`comments.json` in the dropbox); **Cancel** confirms when pins exist, then
discards. Recording, edit, and comment modes are mutually exclusive — while one
is active the other tools are hidden.

## Time travel — state history (pixel-react)

Click the **rewind-clock** icon in the bar (just below Comment) to open
the **States** pane — a right-docked, expand/collapse panel (like the design
pane) that lists every captured app-state commit as a timestamp. Click a
timestamp, or step with the **‹ ›** chevrons, to **freeze** the live app to that
state; **Resume live** closes the pane and returns to the live app (closing the
pane without resuming also unfreezes if you were frozen).

This is powered by **pixel-react**, a thin wrapper around React that the app
loads in place of `react` in development. It has three modes:

- **capture** (default): every hook runs normally and its value is recorded, so
  each distinct commit becomes a frame (in-memory, newest 50 kept).
- **suppress** (while frozen): hooks return the captured frame's values and
  effects no-op, so the DOM shows the historical state without re-running side
  effects.
- **restore** (on cancel): the pre-freeze state is seeded back and the app goes
  live again.

### Enabling pixel-react in your app (dev only)

Install already covers both steps below (the `pixel()` / `withPixel` helpers plus
`<PixelStateRoot>` in the provider snippet). If an existing install is missing
either piece, add them — without the remount boundary, the States pane opens but
clicking a state won't freeze the UI.

**1. Alias `react` → `@getpixel/ui/pixel-react` for your app source only.** This
is the "mock the React import" step. Scope it to your `src/` — do **not** alias
`node_modules` (that would capture `@getpixel/ui`'s own UI and React itself).

Vite — add the bundled plugin (`vite.config.ts`). `pixel()` is the dev alias plus
the [production stub](#keep-pixel-out-of-your-production-bundle);
`pixelReactAlias()` is the alias on its own:

```ts
import { resolve } from 'node:path'
import { pixel } from '@getpixel/ui/vite'

export default defineConfig({
  plugins: [pixel({ appDir: resolve(__dirname, 'src') }), react()],
  optimizeDeps: { include: ['@getpixel/ui/pixel-react'] },
})
```

Next.js — wrap your config (`next.config.ts` / `next.config.js`):

```ts
import type { NextConfig } from 'next'
import { withPixel } from '@getpixel/ui/next'

const nextConfig: NextConfig = {
  // your existing config…
}

export default withPixel(nextConfig, { rootDir: __dirname, appDir: 'src' })
```

`withPixel` adds dev-only client webpack wiring: transpiles `@getpixel/ui`,
unifies Next's compiled React with your app's real React, and routes both `react`
and Next's `compiled/react` hook imports → pixel-react for files under `appDir`
only (SWC may split hooks across those two entry points — aliasing just `react`
breaks time-travel). In a monorepo, point `rootDir` at the package that owns
`next.config` (often `__dirname`) and set `appDir` to that package's source root.
It also handles [StrictMode](#strictmode) and the
[production stub](#keep-pixel-out-of-your-production-bundle).

Scope by app source path (not "exclude node_modules"): bundlers pre-bundle
`@getpixel/ui` through esbuild where importer paths aren't reliably under
`node_modules`, so a substring exclusion leaks the alias into the SDK — which
would capture and freeze Pixel's own UI.

**2. Wrap your app content in `<PixelStateRoot>`** so pixel-react can remount it
for time-travel. Keep `<Overlay />` (and any Pixel UI) **outside** it:

```tsx
const PIXEL_ENABLED = import.meta.env.DEV

<PixelProvider isEnabled={PIXEL_ENABLED} config={{ /* … */ }}>
  <PixelStateRoot enabled={PIXEL_ENABLED}>
    <App />
  </PixelStateRoot>
  {PIXEL_ENABLED && <Overlay />}
</PixelProvider>
```

### StrictMode

**Do not use `<React.StrictMode>`** around aliased app code. Its dev
double-invoke re-runs a component's hooks against the same fiber, which desyncs
pixel-react's per-render capture cursor and silently corrupts captured frames.

Next enables strict mode by default, so `withPixel` turns it off **in
development** and prints a one-line notice; production builds are untouched
(StrictMode doesn't double-invoke there). Pass `strictMode: true` to keep it and
accept a degraded States pane. On other setups, drop the `<React.StrictMode>`
wrapper from your dev entry — pixel-react warns in the console if it finds one.

### Caveats

- **Development builds only (for time-travel).** pixel-react keys hook state by
  the fiber React exposes on its private internals — `ReactCurrentOwner` on 18,
  `A.getOwner()` on 19. Both work, but only development builds of `react-dom`
  track an owner fiber at all, so a production bundle would collapse capture to a
  single `@root` bucket. That's fine in practice: the alias is dev-only. Pixel
  logs a warning if it ever finds itself without one.
- **Client components only.** Server components / static DOM have no client hook
  state; they simply aren't captured (they stay as-is in the frozen view).
- **Effects are suppressed while frozen** — a frozen frame won't re-fetch or
  re-run subscriptions. On **restore/cancel** effects run again (a re-fetch is
  possible) as the app returns to live.
- **Refs and external stores**: DOM refs are never injected (they regenerate on
  mount); `useSyncExternalStore` snapshots are captured per consumer.
- Frames are **in-memory and session-scoped** (max 50) — nothing is persisted.

## Develop this repo

```bash
git clone https://github.com/adamkleingit/pixel
cd pixel
npm install
npm run build            # build @getpixel/ui + @getpixel/server

# terminal 1 — the server (writes ./.pixel/inbox/<id>/)
npm run server          # http://localhost:41789

# terminal 2 — the example app (consumes @getpixel/ui as a built package)
npm run example         # http://localhost:5180
```

Open the example, **double-tap Space** to start recording (allow the mic), move
the mouse and click around (each click pulses a purple radar blip), then
**double-tap Space** again to stop. The recording is POSTed to the server and
saved under `pixel/.pixel/inbox/`.

Recordings save to `pixel/.pixel/inbox/<id>/`. The first recording
with audio downloads the Whisper model (~150 MB) once; transcription then runs in
the background and writes `transcript.json`.

## Testing

```bash
npm test           # unit (Vitest)
npm run test:e2e   # e2e (Playwright) — the example app is workspace-LINKED to the SDK
npm run test:pack  # packaging smoke — installs the PUBLISHED tarballs into a clean app
```

`test:e2e` and `test:pack` are complementary. The e2e suite drives the example app
consuming `@getpixel/ui` through the workspace symlink and the server via `tsx` — great
for iterating on behavior. The **pack smoke** (`test:pack`) instead builds the packages,
`npm pack`s them, and installs the tarballs into a clean app **outside** the workspace
(`e2e/pack/`), then asserts the server connects and an edit round-trips. That's the only
test that exercises the real published bytes, so it catches packaging regressions —
a missing `files` entry, a broken `exports`/`bin`, a missing runtime dependency — that
the linked suite silently tolerates. All three run on every PR (`.github/workflows/ci.yml`).

## Releasing

Versioning + publishing is automated with [changesets](https://github.com/changesets/changesets).
`@getpixel/ui` and `@getpixel/server` are versioned in **lockstep** (same version, always
published together).

Releases are **fully automatic on merge to `main`** — there's no separate release PR
to approve.

1. **On a PR** that changes a package, add a changeset: `npx changeset` → pick
   **patch** / **minor** / **major** and a one-line summary, then commit the generated
   file. CI's `changeset` job fails a package-touching PR that has none.
2. **On merge to `main`**, the `Release` workflow ([release.yml](.github/workflows/release.yml))
   does everything in one run: `changeset version` (apply the bump + changelogs, delete
   the changeset) → build → `changeset publish` (publish to npm via the `NPM_TOKEN`
   secret) → commit the bump back to `main` and push the tags.
3. A merge with **no** pending changeset (docs, CI, tests…) publishes nothing — the
   run is a no-op.

Every merged changeset publishes immediately, so a PR with no changeset ships no
release. To batch several changes into one version, land them together.

