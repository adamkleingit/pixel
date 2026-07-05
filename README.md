# Pixel - the missing visual layer of coding agents

Pixel lets you point your coding agent at UI changes two ways: **record** them
(audio + mouse movements/clicks + drag-selected regions) as a spoken brief, or
**edit** the running app directly (Figma-style move/resize/restyle/retype) and
**Save**. Either way the change lands in a dropbox your agent watches and applies
to the source.  
It seamlessly integrates with your existing coding agent  

## Getting Started with your agent
Simply copy-paste this into your existing coding agent:

```
Install and setup Pixel by following this guide:  
https://github.com/adamkleingit/pixel#installation
```


## Installation
First install @getpixel/ui and @getpixel/server in your codebase, and add to your package.json  

Using npm/yarn/bun:
```bash
npm install @getpixel/ui @getpixel/server
yarn add @getpixel/ui @getpixel/server
bun install @getpixel/ui @getpixel/server
```

Then add the provider and overlay to your app:
```tsx
import { ScreenshareProvider, Overlay, httpSink } from '@getpixel/ui'

// Pixel is a dev-time tool — gate it on your bundler's dev flag so it never
// ships to production. Vite: import.meta.env.DEV. Webpack/CRA/Next:
// process.env.NODE_ENV !== 'production'.
const enabled = import.meta.env.DEV

export function Root() {
  return (
    <ScreenshareProvider
      isEnabled={enabled}
      config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}
    >
      <YourApp />
      {enabled && <Overlay />}
    </ScreenshareProvider>
  )
}
```

`isEnabled={false}` makes the provider completely inert — no styles, no keyboard
shortcuts, no event capture, and `start()` does nothing — so Pixel adds nothing
to a production build. Render `<Overlay />` behind the same flag so the floating
bar is dev-only too.

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

And then install the skill from the local pixel installation:

```bash
npx @getpixel/server install-skill --global # → ~/.claude/skills/pixel
```

## Running
1. Send **"pixel"** (or "start pixel") to your coding agent
2. Start recording by double-tapping **Space** inside your app
3. Describe your changes. Single **Space** to pause/resume, double **Space** to finish, **Esc** to cancel
4. Your agent will do the rest

### Configuration

SDK (`ScreenshareProvider` `config` prop):

```tsx
<ScreenshareProvider
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
via `useScreenshare().setPassthrough(...)`; pausing always makes the page live.

Server (env vars):
- `SCREENSHARE_PORT` (default `41789`)
- `SCREENSHARE_DIR` (default: `.screenshare/` at the workspace root)
- `SCREENSHARE_TRANSCRIBE` (`0` to disable transcription)
- `SCREENSHARE_WHISPER_MODEL` (default `Xenova/whisper-base`)
- `SCREENSHARE_WHISPER_LANG` — spoken language, e.g. `english`. **Unset → Whisper
  defaults to English**, so set this if you narrate in another language.
- `SCREENSHARE_WHISPER_TASK` — `transcribe` (default) or `translate` (→ English).

> **Using a component workbench?** See [Using Pixel with Storybook](#using-pixel-with-storybook) —
> recordings keep running across story switches.

## Using Pixel with Storybook

Pixel works great for narrating changes against individual components in Storybook,
and a recording **keeps running as you switch stories** — so you can record one
brief that spans several of them.

**1. Run the server** (same as any other app):

```bash
npx @getpixel/server      # writes ./.screenshare/inbox/<id>/, listens on http://localhost:41789
```

**2. Add a dev-only decorator** in `.storybook/preview.tsx`. The `import.meta.env.DEV`
gate ensures the static `build-storybook` output never ships Pixel:

```tsx
import { Overlay, ScreenshareProvider, httpSink } from '@getpixel/ui'
import type { Decorator } from '@storybook/react'

const withPixel: Decorator = (Story) => {
  if (!import.meta.env.DEV) return <Story />
  return (
    <ScreenshareProvider config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}>
      <Story />
      <Overlay />
    </ScreenshareProvider>
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
  that receives two kinds of **tasks** and writes each into a `.screenshare/inbox/<id>/`
  dropbox on disk:
  - **recordings** (POST `/recordings`) — **transcribed with Whisper** (Transformers.js
    + a bundled ffmpeg, fully local) into `transcript.json`, then merged into a
    time-ordered `timeline.json`;
  - **saved edits** (POST `/edits`) — a batch of direct UI changes from edit mode,
    written as `edits.json` (no transcription).

  It also extracts the project's **design tokens** for the in-app design pane
  (`GET /tokens`). The bundled **`pixel` skill** drives the agent side: claim a
  task, recognize its kind, and carry it out.
- **`examples/basic`** (`@getpixel/example`) — a Vite React app that consumes
  `@getpixel/ui` as a published (built) package.

## On-disk task layout

A **recording** task:

```
.screenshare/inbox/<id>/
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
.screenshare/inbox/<id>/
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
the server as an `/edits` task; **Cancel** (X, or **Esc**) reverts and exits.
Saved edits land in the dropbox alongside recordings, and the agent applies them
to source — preferring the **symbolic token form** (e.g. `bg-primary`,
`var(--brand-coral)`) over a raw value when a change was bound to a design token.

## Develop this repo

```bash
git clone https://github.com/adamkleingit/pixel
cd pixel
npm install
npm run build            # build @getpixel/ui + @getpixel/server

# terminal 1 — the server (writes ./.screenshare/inbox/<id>/)
npm run server          # http://localhost:41789

# terminal 2 — the example app (consumes @getpixel/ui as a built package)
npm run example         # http://localhost:5180
```

Open the example, **double-tap Space** to start recording (allow the mic), move
the mouse and click around (each click pulses a purple radar blip), then
**double-tap Space** again to stop. The recording is POSTed to the server and
saved under `screenshare/.screenshare/inbox/`.

Recordings save to `screenshare/.screenshare/inbox/<id>/`. The first recording
with audio downloads the Whisper model (~150 MB) once; transcription then runs in
the background and writes `transcript.json`.

