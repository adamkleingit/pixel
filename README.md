# Pixel - the missing visual layer of coding agents

Pixel allows you to capture a screen recording, with **audio, mouse movements/clicks, drag-selected regions**   
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

export function Root() {
  return (
    <ScreenshareProvider
      config={{ sink: httpSink('http://localhost:41789'), bar: { always: true } }}
    >
      <YourApp />
      <Overlay />
    </ScreenshareProvider>
  )
}
```

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
    passthrough: false,        // initial mode: false = page inert, true = clicks pass through
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
full controls (pause/resume, stop, cancel, the live `pass` toggle) while recording.
A **−/＋** button minimizes/expands it. Positions:

| | left | center | right |
|---|---|---|---|
| **top** | `top-left` | `top-center` | `top-right` |
| **center** | `center-left` ↕ | — | `center-right` ↕ (default) |
| **bottom** | `bottom-left` | `bottom-center` | `bottom-right` |

`center-left` / `center-right` lay the bar out **vertically**. Opacity defaults to
30% and animates to 100% on hover.

The mode (`passthrough`) is also togglable live from the bar and via
`useScreenshare().setPassthrough(...)`; pausing always makes the page live.

Server (env vars):
- `SCREENSHARE_PORT` (default `41789`)
- `SCREENSHARE_DIR` (default: `.screenshare/` at the workspace root)
- `SCREENSHARE_TRANSCRIBE` (`0` to disable transcription)
- `SCREENSHARE_WHISPER_MODEL` (default `Xenova/whisper-base`)
- `SCREENSHARE_WHISPER_LANG` — spoken language, e.g. `english`. **Unset → Whisper
  defaults to English**, so set this if you narrate in another language.
- `SCREENSHARE_WHISPER_TASK` — `transcribe` (default) or `translate` (→ English).


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
  that receives a recording, writes it to a `.screenshare/inbox/<id>/` dropbox on
  disk, **transcribes the audio with Whisper** (Transformers.js + a bundled
  ffmpeg, fully local) into `transcript.json`, and merges everything into a
  time-ordered `timeline.json`.
- **`examples/basic`** (`@getpixel/example`) — a Vite React app that consumes
  `@getpixel/ui` as a published (built) package.

## On-disk recording layout

```
.screenshare/inbox/<id>/
  meta.json         id, startedAt, durationMs, counts
  events.json       pointer / click (+ target chain) / rect events, on one t-clock
  audio.webm        mic audio (omitted if mic denied)
  transcript.json   Whisper output: { text, segments:[{start,end,text}], language }
  timeline.json     merged brief: { frames[], beats[] } (speech/silence beats)
  snaps/
    frame-*.png     full-viewport screenshots w/ coordinate grid (start/resume)
    snap-*.png      region screenshots (100px padding + drawn rectangle)
```

## Inline Figma-style editing of the user interface  
(coming soon)  

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

