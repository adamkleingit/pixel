# Screenshare — A Standalone Record-Point-Draw Library

**Screenshare is a standalone, self-contained project** — its own repo/workspace,
with **no dependency on Pixel or any other product.** A user arms it, talks, moves
the cursor, clicks, and scribbles over a live page; it produces a single artifact
— an **audio track + a timestamped event stream** in which every click and
drawing is resolved to the DOM element it targeted — and drops that artifact into
a directory on disk. A coding agent (Claude Code, Cursor, Codex — whatever the
user already runs) picks it up from there and acts on it.

The whole point: **anyone can install Screenshare into their existing app and
wire it to their existing coding agent, with Pixel nowhere in the picture.** Pixel
is merely one *possible* consumer that may later run the Screenshare server in
parallel with its agent; it gets no special treatment here. Wherever this spec
says "a host" it means any app embedding the SDK; Pixel appears only as an
occasional illustrative example.

The project is three pieces (§3):
- **`@pixel/ui`** — the in-page React SDK (overlay, capture, draw tools).
- **`@pixel/server`** — a standalone Node process that receives a finished
  recording and writes it to the on-disk dropbox (§8); later it also transcribes
  and correlates.
- **the agent integration** — *for now, files*: the server writes the dropbox, the
  agent watches it (a small skill). Later, a **subscribable hook** the agent can
  attach to for a more seamless, push-style integration (§8.7). The SDK ⇄ server
  ⇄ agent boundary is always decoupled; no product sits across it.

---

## 1. Goals and non-goals

### 1.1 Goals
- **Drop-in, host-agnostic.** `npm i @pixel/ui`, wrap the app in one
  provider, mount one overlay. Zero dependency on any particular product, agent,
  or design system. Works in any React DOM app.
- **Point and draw instead of typing.** While recording, the cursor changes and a
  transparent overlay lets the user hover/click *anything on the page* and draw
  shapes over it. Nothing in the underlying app is triggered — the page is inert;
  every interaction is **observed and timestamped**, never dispatched.
- **Time is the join key.** Every pointer move, hover, click, and completed
  drawing is stamped on one monotonic clock that starts at `t=0` when recording
  begins, so the stream can later be correlated against the audio ("at 3.2 s the
  user circled *this* element and said…"). The SDK emits the timeline; the
  **correlation/analysis happens server-side, decoupled** (§8).
- **Targets resolve to elements.** Every click and every drawing computes *which
  DOM element(s)* it lands on / encloses, via the library's own DOM hit-testing.
  An optional `ElementResolver` (§7) lets a host enrich each target with its own
  identity (Pixel attaches `pixel-id` + source location); without one, targets
  carry a stable DOM locator.
- **Two activation paths.** A **double-tap of Space** (when focus is not in an
  input/textarea/contenteditable) *or* a programmatic call / button arms
  recording. A **single Space** stops it. Both are configurable; nothing else is
  assumed about the host's chrome.
- **The artifact is the product.** Recording resolves to one plain
  `Recording` object (audio blob + events + targets). The library hands it back
  and forgets it. No upload, no transcription, no persistence baked in.

### 1.2 Non-goals (this version)
- **No pixel video.** "Record a video" here means *audio + a structured event
  timeline*, not an `.mp4` of pixels. The
  one exception is **still region snapshots** (§6.4) — single cropped PNGs the
  user deliberately captures — not a continuous stream. A real screen recording
  and capture-source settings are deferred (§10).
- **No transcription, no correlation, no agent — in the SDK.** The SDK emits raw
  audio + events to the server. Transcription, the audio↔event temporal join,
  prompt assembly, and the agent itself live outside the SDK (server-side and in
  the user's own coding agent). This keeps the SDK free of STT/model/network
  concerns.
- **No persistence.** A `Recording` is an in-memory object handed to a callback.
  Saving, naming, replay libraries — host concern.
- **No machine-wide / OS overlay.** Scope is the host web document (and its shadow
  roots). A desktop whole-screen shell is analyzed and deferred in §10.
- **No selection logic of its own.** The library can *target* elements (hit-test)
  but does not *select* them as state. The Pixel-only Select tool (§6) is a plugin.

---

## 2. Delivery model — why in-page, not a desktop overlay

The headline capability — *"which element did this click/drawing target"* — is a
**DOM capability, not a screen capability.** Resolving a coordinate to a `Submit`
button inside `Card.WithIcon` (let alone to a `pixel-id`) requires
`document.elementFromPoint` + the live element + the host's resolver, all of
which exist **only inside the page's renderer**. A machine-wide OS overlay sees
pixels and the Accessibility tree: coarse, app-dependent, no component identity,
no pixel-id. So the core *must* run in-page; that is also what makes it "install
everywhere" with no OS permissions.

A desktop whole-screen overlay (transparent, click-through, always-on-top
window) is therefore **not an alternative architecture — it's an optional
distribution shell** layered later. When machine-wide reach is wanted, the shell
embeds *this same in-page core* into each web view and degrades to
coordinates-only over non-web surfaces. (A host that already ships an Electron
app — Pixel, for instance — can run that shell alongside the Screenshare server.)
Deferred in §10.

The rest of this spec specifies the in-page React library.

---

## 3. Public API and packaging

Its own workspace (npm workspaces), `type: module`, **`react` + `react-dom` as
peer deps** on the SDK (it mounts into the host's React tree — never bundle a
second copy). The SDK keeps runtime deps minimal: `fix-webm-duration` (a ~6KB
best-effort patch for browsers that omit the WebM `Duration` element, e.g.
Firefox/older Chrome) and `html-to-image` (DOM rasterization for the region
screenshots, §6.4 — no screen-share permission). Styles are self-contained (an
injected stylesheet scoped under a wrapper class); it must not assume Tailwind or
any host design system is present.

The **server** adds the heavier transcription stack (`@huggingface/transformers`
for Whisper + `ffmpeg-static` to decode audio); these are server-only and never
reach the browser.

```
screenshare/                         ← standalone, OUTSIDE any product repo
  SPEC.md                            ← this document
  package.json                       { private, workspaces: ["packages/*", "examples/*"] }
  packages/
    ui/                              @pixel/ui — the in-page SDK
      package.json                   { peerDependencies: { react, react-dom } }
      src/
        index.tsx          public surface
        ScreenshareProvider.tsx   context: config, state machine, the active Recording
        Overlay.tsx        the capture+draw surface (the one thing the host mounts)
        useScreenshare.ts  { state, start, stop, cancel, tool, setTool, lastRecording }
        machine.ts         idle→recording→paused state machine (pure)
        recorder.ts        getUserMedia + MediaRecorder + level meter + event assembly
        capture/
          pointer.ts       throttled pointer sampling, click detection
          hittest.ts       elementFromPoint through shadow roots; enclosure tests
          keys.ts          double-Space arm/stop detector
        draw/
          tools.ts         tool registry (cursor, line, arrow, rect, ellipse, pen)
          strokes.ts       in-progress + fading-stroke render model
          blip.tsx         click "radar blip" animation
        sinks/
          httpSink.ts      POST the Recording to @pixel/server
        types.ts           Recording, ScreenshareEvent, Target, GestureEvent…
        plugins.ts         ToolPlugin + ElementResolver + RecordingSink contracts
  packages/
    server/                          @pixel/server — standalone Node ingest
      src/
        index.ts           HTTP server: POST /recordings, GET /recordings/:id/status
        store.ts           atomic dropbox writer (inbox/working/done)
        (later) transcribe.ts, correlate.ts
  examples/
    basic/                           a plain Vite React app that mounts the SDK
```

The entire SDK public surface:

```ts
// @pixel/ui
export function ScreenshareProvider(props: {
  children: React.ReactNode
  config?: ScreenshareConfig
  onComplete?: (rec: Recording) => void   // fires once on stop
  onCancel?: () => void
}): JSX.Element

export function Overlay(props?: { className?: string }): JSX.Element  // mount once

export function useScreenshare(): {
  state: 'idle' | 'recording' | 'paused'
  start(): void
  pause(): void
  resume(): void
  stop(): void
  cancel(): void
  tool: ToolId
  setTool(id: ToolId): void
  lastRecording: Recording | null
  status: RecordingStatus | null   // live agent status from the sink (§8)
}

export interface ScreenshareConfig {
  activation?: { doubleTapKey?: string; stopKey?: string; enabled?: boolean } // default Space/Space
  audio?: boolean                 // default true; false ⇒ events-only
  tools?: ToolPlugin[]            // extra tools (Pixel adds Select); built-ins always present
  resolver?: ElementResolver     // host enrichment of targets (Pixel adds pixel-id)
  rootResolver?: (el: Element) => ShadowRoot | Document  // where to elementFromPoint (shadow DOM)
  sink?: RecordingSink           // where the finished Recording is persisted (§8)
  pointerHz?: number              // default 30
}
```

A host integrates in three lines: wrap with `<ScreenshareProvider onComplete={…}>`,
render `<Overlay/>` once near the root, optionally call `start()` from a button.
Everything else (double-Space, drawing, targeting, audio) is internal.

---

## 4. Recording lifecycle

Three states. Pause is first-class: the user can **freeze the recording, go
operate the real page, then resume narrating** — so a recording can span "let me
set up the screen, *now* let me point at it."

```
        double-tap Space  /  start()  /  Record btn
   idle ───────────────────────────────────────▶ recording ◀───────┐
     ▲                                            │   │   ▲          │
     │                                            │   │   │ single   │ single
     │            double-tap Space / stop()       │   │   │ Space /  │ Space /
     │◀────────────────────────────────────────────┘   │   │ Resume   │ Pause
     │      (finalize → onComplete(Recording))          │   │ btn      │ btn
     │                                                  │   └── paused ┘
     │                                                  │   (clock frozen, page LIVE)
     └───────────────── Esc / cancel() ────────────────┘
                        (discard, onCancel — valid from recording OR paused)
```

- **Arm.** `idle → recording`: **double-tap Space** (gap < ~400 ms, focus not in
  a text input — §5.4), or `start()`, or a Record button. Clock starts at `t=0`,
  mic arms if `audio` (§5.5), cursor changes, the overlay captures pointer input
  (the page goes inert).
- **Pause ⇄ Resume.** **A single Space toggles pause/resume**, as does the
  floating Pause/Resume icon. On pause the **clock freezes** (paused wall-time is
  excluded from `t`, so `t` is always *active* recording time), the **mic mutes**
  (`MediaRecorder.pause()` — no audio stitching needed), and — crucially — the
  **overlay releases pointer capture so the underlying page becomes interactive
  again.** The user can click around, navigate, set up state. A `PauseEvent`
  marks the gap. Resume re-captures the page and continues the clock.
- **Stop.** **Double-tap Space**, or `stop()`/the floating Stop icon, from
  `recording` or `paused`. Freezes the clock, finalizes the audio blob, assembles
  the `Recording`, persists via the sink (§8), fires `onComplete`, returns to
  `idle`. `lastRecording` is retained for a retry/re-send affordance.
- **Cancel.** `Esc` or `cancel()`, from any non-idle state. Discards audio +
  events + in-progress strokes; `onCancel`; back to `idle`. Esc-vs-mid-draw
  precedence in §5.4.

**Why single-Space=pause and double-Space=stop are unambiguous:** a Space press
starts a short coalescing timer (same detector as arming). A second Space inside
the window → **stop**; otherwise the lone press resolves to **pause/resume**.
Symmetric with arming (double-tap to start, double-tap to stop), and a stray
single Space never ends the recording — it only pauses, which is recoverable.

`machine.ts` is a pure reducer (`idle | recording | paused` × events), trivially
testable; the provider just dispatches into it.

### 4.1 Recording HUD and floating controls (optional, host-styleable)
The library ships a minimal default HUD on its own overlay layer: REC dot,
`mm:ss` of **active** time (dims while paused), mic level meter, current tool,
and the **floating control icons — Pause/Resume and Stop** (plus Cancel) —
mirroring the shortcuts so the feature is fully usable by mouse alone. The HUD
anchors to a screen edge and flips like a tooltip so it never covers the pointer
region. It is **opt-out** (`config` can disable it) and **restyleable** via
`className`, so Pixel can suppress it and render its own chrome while still
driving the same machine through `useScreenshare()`. `useScreenshare()` gains
`pause()`/`resume()` and `state: 'idle' | 'recording' | 'paused'` accordingly.

---

## 5. The capture model

A `Recording` is **one monotonic clock + an append-only event stream + one
optional audio track.** Nothing is sampled into video.

```ts
interface Recording {
  startedAt: number              // epoch ms, for the record only
  durationMs: number             // t at stop
  events: ScreenshareEvent[]     // sorted by t (ms since t=0)
  audio: AudioTrack | null       // null if audio:false or mic denied
}

type ScreenshareEvent =
  | PointerSample      // throttled cursor position
  | HoverEvent         // element under cursor changed
  | ClickEvent         // a recorded "bleep" click (default tool)
  | GestureEvent       // a completed drawing (§6.2)
  | SnapshotEvent      // a rectangular region snapshot (§6.4)
  | PauseEvent         // { t, phase: 'pause' | 'resume' } — clock gap (§4)
  | SelectEvent        // Pixel-only Select tool (§7); absent in plain hosts

interface BaseEvent { t: number }   // ms since t=0, ACTIVE time (paused gaps excluded)
```

### 5.1 Coordinate space
The library has no world/viewport transform of its own (unlike Pixel's canvas).
It stores **viewport-relative client coordinates** (`clientX/clientY`) plus the
page scroll at sample time, so a host that does pan/zoom (Pixel) can convert to
its own space, and a plain host can replay directly. If the host exposes a
transform, it can pass a `toHostSpace(point)` in config; otherwise client coords
are the contract.

### 5.2 Pointer samples & hit-testing
`PointerSample = BaseEvent & { x: number; y: number; targetId: TargetId | null }`.
Captured on `pointermove`, **throttled to `pointerHz` (default 30)** and coalesced
(drop sub-ε moves). `targetId` references the element under the cursor.

Hit-testing is the library's own, and must **pierce shadow roots** (Pixel renders
content in shadow-DOM tiles; preview-architecture.md). Algorithm:

```
hit(x, y):
  root = config.rootResolver?(deepest) ?? document
  el = root.elementFromPoint(x, y)
  while el?.shadowRoot:                 // descend into open shadow roots
    inner = el.shadowRoot.elementFromPoint(x, y)
    if (!inner || inner === el) break
    el = inner
  return el   // null over empty / overlay-only regions
```

The overlay itself has `pointer-events: none` except where it's actively
capturing, and we hit-test with the overlay temporarily excluded (or via
`elementsFromPoint` skipping our own layer) so we resolve the element *underneath*
the overlay, never the overlay. The underlying app never receives the event —
the overlay sits above it and we `preventDefault`/never re-dispatch.

### 5.3 Targets — the resolved identity
Every click and every gesture resolves the element(s) it concerns into a
`Target`, computed **at the moment of the event** so later DOM churn can't
invalidate it:

```ts
type TargetId = string
interface Target {
  id: TargetId
  rect: { x: number; y: number; w: number; h: number }   // client coords at event time
  locator: DomLocator           // always present: tag, role, text snippet, nth-of-type path
  host?: unknown                // ElementResolver output (Pixel: { pixelId, source }) — opaque to lib
}
```

`DomLocator` is the library's own framework-free description (enough to
re-find/describe the element without any host knowledge). `host` is whatever the
optional `ElementResolver` returns — the library treats it as an opaque blob it
carries through to the artifact (§7). Targets are de-duplicated into a
`Recording`-level table and events reference `TargetId`s.

### 5.4 Clicks, hover, and the default tool
With the **default tool** (a pointer that targets, not selects):
- `HoverEvent = BaseEvent & { targetId: TargetId | null }` on every change of the
  element under the cursor.
- A press-and-release on the same point is a **`ClickEvent = BaseEvent & { targetId,
  x, y }`** and renders a **"radar bleep"** — an expanding, fading ring at the
  point that disappears after a few seconds (`ripple.ts`). Purely presentational;
  reconstructable from the event on replay.
- A press-and-drag with the default tool draws a **free line that stays briefly
  then fades** (the "drag to draw" affordance) — recorded as a `freeform`
  `GestureEvent` (§5.3 below) with `ephemeral: true`, distinguishing it from a
  pen-tool stroke that the user means to persist visually.

**Key-handling precedence** (`keys.ts`): the double-Space arm only fires when
`document.activeElement` is not an `<input>`/`<textarea>`/`contenteditable` (so
typing two spaces never arms it). While **recording**, Space is swallowed
(`preventDefault`); a single press = **pause**, a double-tap = **stop** (§4).
While **paused**, the page is live, so Space is *not* swallowed unless focus is
outside inputs — a single Space resumes, a double-tap stops (so the user can get
back to recording or end without reaching for the mouse). Esc precedence
(recording only): mid-draw → abort that stroke; non-default tool, no stroke →
return to default tool; default tool (or Esc again) → cancel the recording.
Always "back out of the most local thing."

### 5.5 Audio
If `audio` (default), arming calls `getUserMedia({ audio: true })` and records via
`MediaRecorder` into one Opus/WebM blob; a denied mic degrades to **events-only**
(`audio: null`) with a HUD warning, not a hard failure. **Pause calls
`MediaRecorder.pause()` and resume calls `resume()`** — the recorder simply omits
paused spans, so the blob's internal time equals active `t` with **no stitching**
needed even across pauses. The library
exposes a live RMS level for the meter and otherwise does nothing with the audio
but hand it back in the `Recording`.

```ts
interface AudioTrack { mime: string; blob: Blob }
```

---

## 6. Draw tools and gestures

Drawing renders on a dedicated `<canvas>`/SVG overlay layer above the page. A
completed drawing is a `GestureEvent`; in-progress strokes live in transient
state and never enter the event stream until released.

### 6.1 Built-in tools
| Tool | Default key | Produces |
|---|---|---|
| Pointer (default) | `V` | no gesture; bleep on click, fading free-line on drag (§5.4) |
| Line | `L` | two-point segment |
| Arrow | `A` | segment with arrowhead at the release end |
| Rectangle | `R` | axis-aligned box — the "surround these" gesture |
| Ellipse / Circle | `C` | bounding-box ellipse — alternate "circle these" gesture |
| Pen (freeform) | `P` | smoothed polyline that **stays and fades** after a few seconds |
| Snapshot (region) | `S` | drag a rectangle → **raster image of the area inside** + enclosed targets (§6.4) |

Tools are a **registry** (`tools.ts`), so the host can add its own (Pixel adds
**Select**, §7). Built-ins are always present unless the host filters them.

### 6.2 Gesture data and target resolution
```ts
interface GestureEvent extends BaseEvent {
  toolId: ToolId
  startT: number; endT: number
  kind: 'line' | 'arrow' | 'rect' | 'ellipse' | 'freeform'
  points: { x: number; y: number }[]   // client coords (line/arrow=2, rect/ellipse=2 corners, freeform=N)
  color: string
  ephemeral: boolean                    // true for the default-tool fading drag-line
  // resolved at release by the library's hit-testing:
  enclosedTargetIds: TargetId[]         // rect/ellipse/closed-freeform: elements substantially inside
  pointedTargetId: TargetId | null      // line/arrow: element under the END point
}
```

The **resolution is the value**: a rectangle is not four numbers, it's "these
three elements were surrounded"; an arrow is "pointing at *this* element." The
library computes `enclosed`/`pointed` via the same hit-testing as §5.2 at release
time, using a **center-point-inside** test for enclosure to start (tunable
threshold — see §11). Each resolved
element becomes a `Target`, so — if the host supplied a resolver — every drawing
already carries `pixel-id`/source on its targets.

### 6.3 Fading and persistence
Two visual lifetimes, both presentational and reconstructable from events:
- **Ephemeral** (bleeps, default-tool drag lines): fade out after ~2–3 s.
- **Persistent** (explicit tool strokes: line/arrow/rect/ellipse/pen): stay for
  the rest of the recording (still fade gently so they don't pile up — tunable),
  because the user drew them to point at something deliberately.

A small always-visible tool hint follows the cursor (the palette + active tool),
fading while a stroke is in progress — discoverability without a manual.

### 6.4 Rectangular region snapshot
The Snapshot tool drags a rectangle and, on release, captures a **still raster
image of the on-screen region inside it** — visual context the agent can *see*,
not just a list of elements. This is the one carve-out from the "no pixel video"
non-goal (§1.2): a single cropped PNG per gesture, never a continuous stream.

```ts
interface SnapshotEvent extends BaseEvent {
  rect: Rect                         // client coords
  image: { path: string; w: number; h: number }  // sidecar PNG (snaps/<n>.png in the bundle)
  enclosedTargetIds: TargetId[]      // elements substantially inside the rect (same test as §6.2)
}
```

The actual pixel grab is delegated to the `SnapshotProvider` seam (§7) because it
is environment-specific:
- **Electron host (Pixel desktop):** `webContents.capturePage(rect)` — exact,
  cheap, no extra permission. Pixel's path.
- **Generic web host:** DOM rasterization (an `html-to-image`-class routine the
  host supplies) for same-origin content; or, where present, a frame grabbed
  from an already-granted `getDisplayMedia` stream cropped to `rect`.
- **No provider configured:** the tool still records `rect` + `enclosedTargetIds`
  (the *intent* — "this region, these elements") and omits `image`. Degrades, not
  breaks.

The library defines the rect and resolves the enclosed elements (its own
hit-testing); only the bytes come from the host. Consistent with every other
seam: the package stays dependency-free, the heavy/native bit is pluggable.

---

## 7. Extension seams — how Pixel plugs in without coupling the library

Two contracts keep everything Pixel-specific *out* of the package:

```ts
// plugins.ts
interface ElementResolver {
  // Library calls this when it builds a Target. Return opaque host data
  // (Pixel returns { pixelId, source }). Library stores it on Target.host.
  resolve(el: Element): unknown | null
}

interface ToolPlugin {
  id: ToolId
  key?: string
  cursor?: string
  // lifecycle the Overlay drives; a tool decides what (if anything) it records.
  onPointerDown?(ctx: ToolCtx, e: PointerEvent): void
  onPointerMove?(ctx: ToolCtx, e: PointerEvent): void
  onPointerUp?(ctx: ToolCtx, e: PointerEvent): void
  render?(ctx: ToolCtx): React.ReactNode   // its own overlay drawing
}
interface ToolCtx {
  hit(x: number, y: number): Element | null     // library hit-testing
  makeTarget(el: Element): Target               // resolve + dedupe
  emit(ev: ScreenshareEvent): void              // push onto the stream
  snapshot(rect: Rect): Promise<SnapshotEvent['image'] | null>  // raster a region (§6.4) via SnapshotProvider
  now(): number                                 // t in ms (active time)
}

// Persistence is a host concern (§8). The library hands the finished Recording
// to a sink; the sink owns disk/daemon I/O. Pure libraries get none of this.
interface RecordingSink {
  save(rec: Recording): Promise<{ id: string }>
  watch?(id: string, cb: (s: RecordingStatus) => void): () => void  // status back from the agent
}
type RecordingStatus =
  | { state: 'queued' }
  | { state: 'claimed'; agentId: string }
  | { state: 'working'; line?: string }     // latest progress.ndjson line
  | { state: 'done'; summary?: string; files?: string[] }
  | { state: 'error'; message: string }

// Pixel-grabbing a region is environment-specific (Electron capturePage vs.
// DOM rasterization), so it is a seam, not baked in. Default tries DOM raster;
// Electron host overrides with webContents.capturePage(rect).
interface SnapshotProvider {
  capture(rect: Rect): Promise<Blob>   // PNG of the on-screen region
}
```

**Pixel's adapter** (lives in `@pixel/canvas`, not in the library):
- An `ElementResolver` that reads `data-pixel-id` off the element and runs it
  through `pixelIdResolver` → `{ pixelId, source: { filePath, line, column } }`
  (inner-components.md §2.1). Now every click/drawing target the library emits is
  already grounded in source — without the library ever importing a Pixel module.
- A `rootResolver` that returns the shadow root of the tile under the cursor, so
  hit-testing pierces Pixel's preview shadow DOM.
- A **Select `ToolPlugin`** — *the Pixel-only feature you described.* It behaves
  like Pixel's normal selection (delegates to selection-model.md), and on each
  pick it `emit`s a `SelectEvent = BaseEvent & { targetId; pixelId; phase:
  'add' | 'remove' }`. Because targets carry `pixel-id` + timestamp, these
  selections drop straight into Pixel's agent context exactly as the brief
  requires. A plain host that never registers this tool simply never produces
  `SelectEvent`s — the library has no notion of selection state.

Everything downstream of the `Recording` — transcription, the audio↔event
correlation pass, prompt assembly, agent dispatch — lives on the Node ingest side
and is reached **via a skill** (§8), consuming the `Recording`. The library's
responsibility ends at `onComplete(rec)`.

---

## 8. Persistence & the agent handoff — a filesystem dropbox

The point of the whole feature is **no copy-paste into Claude/Cursor**. The
recording is dropped into a project-local directory; the coding agent watches
that directory in a loop, **claims** a new recording (atomically, so multiple
agents can't collide), does the work, and **writes its status back** so the
screenshare UI can report progress to the user. The protocol is *just files*, so
any agent — Claude Code, Cursor, Codex — participates with the same skill; no
API keys, no RPC bus, no model coupling in the library.

### 8.1 Where it's saved — the dropbox layout
A gitignored, project-local directory (the agent already runs in this project).
Default `.pixel/recordings/` under Pixel; configurable root (e.g.
`.screenshare/`) for a generic host. **State is the subdirectory**, so every
transition is a single atomic `rename()`:

```
.screenshare/
  inbox/<id>/        complete, unclaimed   { meta.json, events.json, audio.webm?, snaps/*.png }
  working/<id>/      claimed               + claim.json { agentId, pid, claimedAt, heartbeatAt }
                                           + progress.ndjson   (append-only status lines)
  done/<id>/         finished              + result.json { status:'ok', summary, files[], finishedAt }
  failed/<id>/       errored               + result.json { status:'error', message }
```

- `<id>` is a sortable, collision-free id (timestamp-prefixed). Region snapshots
  (§6.4) and the audio blob are sidecar files; `events.json` references them by
  relative path.
- The writer assembles into a **temp dir and `rename`s into `inbox/`**, so the
  agent never observes a half-written recording.

### 8.2 The handoff state machine (filesystem)
- **Claim ("mark as handled").** The skill lists `inbox/`, picks the oldest, and
  attempts `rename(inbox/<id> → working/<id>)`. POSIX `rename` is atomic:
  exactly one agent wins; losers get `ENOENT` and skip. No locks, no DB — this is
  the conflict-free claim across any number of concurrent agents.
- **Heartbeat / crash recovery.** The owner refreshes `claim.json.heartbeatAt`
  every few seconds. A `working/<id>` whose heartbeat is stale past a timeout is
  reclaimable: the next agent (or a reaper) renames it back to `inbox/`, so a
  dead agent never strands a recording.
- **Progress → user.** The owner appends NDJSON lines to `progress.ndjson`
  ("transcribing", "reading Card.tsx:42", "editing…"). Done = write `result.json`
  and `rename(working/<id> → done/<id>)` (or `failed/`). The screenshare side
  **watches** these paths and drives the HUD:
  `Queued → Claimed by Claude → Working… → ✓ Done (3 files) / ✗ Error`.

### 8.3 The bridge — browser → disk (`RecordingSink`)
The SDK is in-page; it cannot touch the filesystem. Persistence is a configured
`RecordingSink` (§7). On stop, the provider calls `config.sink.save(recording)`
and exposes the returned status stream to the HUD via `sink.watch(id)`. Sink
implementations:

- **HTTP sink → `@pixel/server` (default).** The SDK `POST`s the recording
  (multipart: `events.json` + `audio.webm` + any snapshot PNGs) to the standalone
  server, which writes the dropbox and serves `GET /recordings/:id/status` (SSE)
  for status back. Agent-agnostic, works in any browser; **this is the Phase 1
  path.**
- **Electron sink (Electron host).** Preload IPC → main process writes `inbox/`
  and `fs.watch`es `working/`/`done/`. No separate HTTP process. A host that
  already runs Electron (Pixel) can use this instead of the HTTP server.
- **File System Access API sink.** Pure browser: the user grants the dropbox
  directory once and the SDK writes directly. No companion process, but
  Chromium-only, a permission prompt, and status read-back is polling.

### 8.4 The server — who runs, who transcribes
**Yes, there is a standalone Node process: `@pixel/server`.** It is the
only thing outside the browser that touches a recording, and it is **not part of
any agent or product** — it runs on its own (and a host like Pixel may *also*
launch it alongside its agent, but that's optional). The browser does *not* stream
audio live to it (until Phase 3, §13); it hands over the **finished** blob once,
on stop, via `sink.save()` — a single `POST` (chunkable for large blobs). A
recording is a closed artifact by the time the server sees it.

**Transcription happens here, in the server, the moment the bundle lands in
`inbox/` — not in the browser and not inside the coding agent.** Reasons: the
browser has no good offline STT, and coding agents (Claude Code/Cursor/Codex)
can't be assumed to accept audio at all. Doing it at ingest means the agent always
finds a ready transcript + events and only has to read text + file locations.
**(Transcription is Phase 2 — Phase 1 just stores the raw audio + events.)**

**Transcription happens here, on the Node ingest side, at the moment the bundle
lands in `inbox/` — not in the browser and not inside the coding agent.** Reasons:
the browser has no good offline STT, and coding agents (Claude Code/Cursor/Codex)
can't be assumed to accept audio at all. Doing it at ingest means the agent always
finds a ready transcript + events and only has to read text + file locations.

It runs behind a **pluggable transcriber** with a local, offline default, so no
model key and no network — the audio never leaves `127.0.0.1`:

```ts
interface Transcriber {
  transcribe(audioPath: string): Promise<TranscriptSegment[]>   // segment-level timestamps
}
interface TranscriptSegment { t: number; endT: number; text: string }  // active-time ms
```

- **Default:** a bundled/lazy-downloaded offline STT (whisper.cpp-class) shelled
  out as a child process. Segment timestamps come back already on the `t` clock
  (audio time === active `t`, §5.5), so no re-alignment.
- The interface is the seam: a future cloud transcriber, an OS dictation API, or
  "skip STT and feed audio straight to a multimodal agent" are each just a
  different `Transcriber` (or a flag), not new core.
- The ingest writes the transcript next to the events (`transcript.json`) inside
  `inbox/<id>/` *before* the recording is claimable, so by the time an agent wins
  the claim the text is already there.

### 8.5 The correlation pass (events + transcript → brief)
A recording is useless to an agent as parallel raw tracks; the value is the
**temporal join**. For each `TranscriptSegment`, attach the context true during
its `[t, endT]` window:

- the element(s) **hovered / selected** in the window (Hover/Select events),
- the **cursor's element/snapshot** from the dense pointer track,
- any **gesture** whose `[startT,endT]` overlaps (with its `enclosed` / `pointed`
  targets) and any **region snapshot** (with its image + enclosed targets),
- any **click** in the window.

Output is an ordered list of beats — `(spokenText, referencedTargets[],
gestures[], snapshots[], clicks[])` — rendered into the agent prompt, e.g. *"user
drew a rectangle around `CardHeader` (`Card.tsx:42`) and said 'add more padding
here'."* Every referenced target already carries its `pixel-id` + `{filePath,
line, col}` (resolved on the browser side by the `ElementResolver`), so the brief
is grounded in source with no DOM access on the Node side. This pass runs in the
ingest process too (it owns the transcript); the agent skill consumes its output.

### 8.6 The agent skill (the watch loop)
A `pixel` skill, run long-lived (or via `/loop`):

1. watch `inbox/` (fs events, fall back to poll).
2. on a new recording: **atomic-claim** → `working/`, write `claim.json`, start
   the heartbeat.
3. read `events.json` + `transcript.json` (already produced by §8.4) and the
   correlated beats (§8.5); assemble the brief; **do the edits**.
4. stream `progress.ndjson` throughout.
5. write `result.json`; `rename` to `done/`/`failed/`. Loop.

The same skill works for any agent because it only touches files and reads text —
that is exactly what makes Screenshare drop into someone's *existing* agent with
no product in between. The dropbox contract is the only fixed thing.

### 8.7 Later: a subscribable hook (push integration)
Files are the v1 transport because they're universal and zero-coupling. Later, the
server can additionally expose a **subscription the agent attaches to** — an SSE
/ WebSocket / local socket `subscribe(onRecording)` channel — so a running agent
is *pushed* a new recording the instant it lands, instead of polling `inbox/`.
The on-disk dropbox stays the source of truth (and the fallback); the hook is a
latency/ergonomics layer on top. This is what makes the "watch in a loop" skill
optional rather than required, for agents that can hold a live subscription.

---

## 9. Modules

- **`@pixel/ui` (the SDK):** the entire in-page library in §3 — provider,
  overlay, state machine, audio capture + level meter, pointer/hover/click
  capture, shadow-piercing hit-testing, the built-in draw tools + blip/fade
  rendering, double-Space key handling, the `ToolPlugin` / `ElementResolver` /
  `RecordingSink` seams, the default `httpSink`, and the `Recording`/event types.
  **No imports from any host/product.**
- **`@pixel/server` (the standalone Node ingest):** `POST /recordings`
  (writes the atomic dropbox) and `GET /recordings/:id/status` (SSE). Later
  (Phase 2): the pluggable **`Transcriber`** (local default) and the
  **correlation pass**, writing `transcript.json` into `inbox/`. Audio stays on
  `127.0.0.1`. Ships the `pixel` skill (§8.6). Self-contained — no
  product dependency.
- **`examples/basic` (the example app):** a plain Vite React app, §9.1.
- **Optional host adapters (live in the host repo, not here):** e.g. a Pixel
  adapter that supplies an `ElementResolver` (pixel-id → source), a `rootResolver`
  for shadow tiles, and a Select `ToolPlugin`, then drives the machine from its
  own chrome via `useScreenshare()`. Screenshare neither ships nor depends on any
  such adapter; the seams (§7) are the only contact surface.

### 9.1 `examples/basic` — the example app
A plain Vite React app that serves the SDK end-to-end with **no LLM and no
product**:

- A demo page of plain components (buttons, cards, a list) wrapped in
  `<ScreenshareProvider config={{ sink: httpSink(serverUrl) }}>` with `<Overlay/>`.
- Records via double-Space, sends to `@pixel/server`, and shows the local
  `Recording` (event count, duration, audio size) so you can see capture working
  without any agent.
- Later it grows a stub `ElementResolver` (reads a `data-loc` attribute) and an
  Inspector that renders the would-be agent prompt + file locations — the
  "validate the capture UI with zero LLM/product" loop.

It is both the manual test harness and the package's living documentation.

---

## 10. Deferred: the desktop machine-wide overlay shell

A later, separate effort — **not** an alternative to the in-page library but a
*shell around it* (rationale in §2):
- An Electron transparent, click-through, always-on-top window (Pixel already has
  `@pixel/desktop`) provides a whole-screen **drawing + cursor** surface and a
  global pointer hook.
- **Element targeting still requires an in-page agent**: the shell injects the
  same `@pixel/ui` core into each web view it overlays; there it gets
  full DOM + pixel-id targeting. Over **non-web** surfaces (native apps, other
  browsers) it degrades to **coordinates + bleeps + drawings only**, optionally
  enriched by the OS Accessibility tree (coarse, no component identity).
- Costs to plan for then: macOS **Screen Recording + Accessibility** permissions,
  code-signing/notarization, and reconciling global-hook coordinates with each
  web view's client coordinate space.

**Capture-source settings (later phase).** A pre-record settings surface to
choose **what is captured and from where**, most of which only becomes meaningful
alongside real pixel video and/or the desktop shell:
- **Recorded area** — adjust/crop the captured region (a draggable frame), rather
  than the whole document/screen.
- **Which screen / surface** — pick the display, window, or tab (`getDisplayMedia`
  surface selection on web; native display enumeration in the Electron shell).
- **Audio routing** — choose the **mic input device**
  (`enumerateDevices`/`deviceId`), and whether to also **capture computer/system
  audio** (loopback). System-audio capture is awkward on the web (Chromium tab
  audio only) and clean in the Electron shell — another reason it pairs with §10's
  desktop direction.
These are explicitly out of the in-page MVP (which records the document + mic);
they are a settings layer added when video/desktop land.

Other deferred items:
- **Real pixel video** alongside the structured timeline (human-watchable handoff).
- **Take library / persistence** beyond the dropbox, **retry/re-send** as host UI.
- **More gesture kinds** (text labels, highlight fills, measurement).
- **Multiplayer / shared playback.**

---

## 12. Phasing

### Phase 1 — capture UI + server + example (this build)
The smallest end-to-end loop, **no LLM, no transcription, no targeting**:
1. **`@pixel/ui` skeleton**: provider + overlay + pure state machine,
   `idle ⇄ recording`, driven by **double-Space to start and double-Space to
   stop** (input-focus guarded) and `start()/stop()` from `useScreenshare()`.
   A minimal REC indicator (dot + timer).
2. **Capture: audio + pointer**: `getUserMedia` + `MediaRecorder` for audio;
   throttled `pointermove` samples and `click` events, all on one `t` clock.
   **Observe-only** (overlay is `pointer-events:none`; the real page stays usable)
   — full inert-page capture comes with the tools in Phase 2.
3. **Click radar blip**: each click spawns a **purple glowing radar blip** that
   expands and fades.
4. **`httpSink` + `@pixel/server`**: on stop, POST the `Recording`
   (events JSON + audio blob) to the server, which **writes it to disk** in the
   `inbox/<id>/` dropbox (atomic temp-dir → rename).
5. **`examples/basic`**: a Vite React app mounting the SDK against the server.

### Phase 2 — targeting, tools, transcription
**Done (built & verified):**
- **Click target chain** — every click records its DOM ancestor chain
  (`tag · id · classes · text`, outermost → innermost) via `elementFromPoint`
  (`capture/hittest.ts`). Observe-only; the overlay is `pointer-events:none`.
- **Drag rectangle + region screenshot** — a pointer drag (past a threshold)
  records `{x,y,width,height,startT,endT}` and rasterizes the region with
  `html-to-image`, cropped client-side, uploaded as a PNG sidecar
  (`capture/snapshot.ts`, the `RectEvent`). Click-vs-drag is decided on pointer up.
- **Server-side Whisper transcription** — pluggable `Transcriber` with a local
  default: `@huggingface/transformers` (Whisper) + bundled `ffmpeg-static` to
  decode webm→PCM, writing `transcript.json` with per-segment timestamps. Runs in
  the background after save; audio stays on `127.0.0.1`. Language via
  `SCREENSHARE_WHISPER_LANG` (unset ⇒ English; set `hebrew` etc. for other langs).

**Still to do in Phase 2:**
- **Pause/resume** (single-Space pause, page goes live; double-Space stop) + the
  floating Pause/Stop controls. *(Phase 1 still uses double-Space to toggle.)*
- **Inert-page mode + drawing tools** (arrow, pen, ellipse) beyond the drag rect.
- The **correlation pass** (§8.5) joining transcript segments ↔ events, and the
  `pixel` skill (§8.6).
- Optional **host adapters** (e.g. a Pixel pixel-id `ElementResolver` + Select
  tool) proving the seams.

### Phase 3 — streaming (§13)
Move from "one finished blob on stop" to a **live stream** during recording:
incremental audio + event chunks pushed to the server as they're produced, and a
**subscribable hook** (§8.7) that pushes a recording to a waiting agent the instant
it lands — so transcription/correlation can begin *before* the user hits stop, and
an agent can react in near-real-time.

---

## 13. Phase 3 — streaming (design sketch)

Today (Phase 1–2) a recording is a closed artifact: capture fully, then `POST`
once. Phase 3 makes capture **incremental** without changing the artifact's final
shape.

- **SDK side.** `MediaRecorder` is started with a `timeslice` so it emits audio
  chunks every N ms; the event stream is flushed on the same cadence. A
  **streaming sink** opens a single connection on `start()` (chunked `POST` /
  WebSocket / `fetch` with a `ReadableStream` body) and appends
  `{ seq, audioChunk?, events[] }` frames; `stop()` sends a final `done` frame.
  The non-streaming `httpSink` stays as the fallback for hosts/browsers that can't
  hold the connection.
- **Server side.** The server appends chunks to `working/<id>/audio.partial.webm`
  and `events.ndjson` as they arrive, so a crash mid-recording still yields a
  usable partial. On `done` it finalizes into the normal `inbox/`→claim flow.
  **Transcription can run on a rolling window** over the partial audio, emitting
  early `transcript.json` segments.
- **Push to the agent.** The subscribable hook (§8.7) lets a connected agent
  receive frames (or at least the "recording started / updated / finalized"
  signals) live, instead of polling `inbox/`. Files remain the source of truth and
  the fallback.
- **Backpressure & ordering.** Frames carry a monotonic `seq`; the server acks the
  last contiguous `seq` it persisted, and the SDK retains unacked frames so a brief
  disconnect re-sends rather than drops. Audio and events share the `t` clock, so
  late-arriving frames still slot in by timestamp.

Non-goals for Phase 3 stay: still no pixel video, no multiplayer.

---

## 14. Open questions

- **Enclosure threshold** (§6.2) — center-point-inside vs. fraction-of-area for
  "surrounded." Start with center-point; tune against real drawings.
- **Shadow-DOM depth & closed roots** (§5.2) — `elementFromPoint` can't pierce
  *closed* shadow roots; the `rootResolver` seam is the escape hatch.
- **Default-tool drag vs. pan/scroll** — while recording with tools active the
  page is inert (we own pointer) so a drag draws; in Phase 1's observe-only mode
  the page scrolls normally and we just sample it. Confirm the transition feels
  right when Phase 2 lands.
- **Streaming transport** (§13) — chunked `POST` vs. WebSocket vs. `fetch`
  streaming body; pick per browser support once Phase 3 starts.
