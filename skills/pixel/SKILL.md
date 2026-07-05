---
name: pixel
description: >
  Pick up Pixel tasks dropped on disk and carry them out in the codebase. A
  task is either a **recording** (voice + clicks + selected regions, acted on as an
  implementation brief) or a **saved edit** (direct visual changes the user made in
  the running app's in-app edit mode and hit Save). Use when the user says "pixel",
  "start pixel", "check for recordings", "watch pixel", "process my
  recording", "apply my edits", or points you at a .pixel dropbox folder. On
  "pixel" / "start pixel", start the ingest server and watch for tasks (steps 1 → 6).
---

# Pixel watch

Pixel drops **tasks** into an on-disk **dropbox** for you to carry out in the
current codebase. A task is one of two kinds:

- a **recording** — a short session of microphone audio (transcribed), mouse
  movements/clicks, and drag-selected regions (with screenshots), acted on as a
  spoken implementation **brief**; or
- a **saved edit** — a batch of direct visual changes the user made in the app's
  in-app **edit mode** (move / resize / restyle / retype elements) and hit
  **Save**. Your job is to write those changes into the source so they persist.

Claim a task, recognize which kind it is (step 4), and carry it out.

**"pixel" / "start pixel"** — start the ingest server (step 1), then **tell the
user how to use Pixel** (verbatim):

```
Two ways to point me at changes — I pick up either automatically:

🎙  Record what you want
1. Double-tap Space inside your app to start; describe your changes out loud
2. Single Space to pause/resume, double Space to finish, Esc to cancel

✏️  Edit directly
1. Click the pencil in the bar (or double-tap Enter) to enter edit mode
2. Move / resize / restyle / retype elements right on the page
3. Save (the disk button, or double-tap Enter) to send them — Esc discards

Either way, I do the rest.
```

Then enter the **watch loop** (step 6) and stay in it: first **drain** any tasks
already waiting in the inbox, then **block** until the next one lands, claiming
(step 3), reading (step 4), and doing the work (step 5) for each. **Looping is the
default — keep watching until the user explicitly asks you to stop.**

## 1. Make sure the ingest server is running

Recordings only land on disk if `@getpixel/server` is running (it writes the dropbox
and transcribes audio). If nothing is recording or no `.pixel/` exists yet,
start it (it stays up; run it in the background):

```bash
npx @getpixel/server        # http://localhost:41789 → writes .pixel/inbox/<id>/
```

Set `PIXEL_DIR` to control where it writes, and `PIXEL_WHISPER_LANG`
(e.g. `hebrew`) if narration isn't English.

On startup the same server also **extracts the project's design tokens** (from
shadcn `globals.css`, a Tailwind config, or `@theme` CSS) into
`.pixel/design-tokens.json`, and **watches those source files** — re-extracting
whenever they change. This is automatic; there's no separate command. The in-app
design pane reads the file over `GET /tokens` so its color/spacing/radius pickers
and on-canvas drag-snap reflect the real design system. It also extracts from the
directory the server runs in; set `PIXEL_PROJECT_DIR` to point at a different
project root.

> **If Pixel isn't installed or isn't configured correctly** (the command fails,
> the package is missing, or the server won't start), follow the project README to
> install and set it up first — then come back here, run the server, and continue
> listening for file changes.

## 2. Find the dropbox

Look for the `.pixel/` directory (default at the project root). It contains:

```
.pixel/
  inbox/<id>/      ← new, unclaimed tasks (recordings or saved edits)
  working/<id>/    ← currently being handled (you create this)
  done/<id>/       ← finished (you create this)
  design-tokens.json  ← the project's extracted design tokens (server-maintained)
```

If you can't find it, ask the user for the path (it's wherever they ran
`@getpixel/server`, honoring `PIXEL_DIR`).

A **saved-edit** task directory contains just `edits.json` (+ a `meta.json` /
`timeline.json` marker) — see step 4. A **recording** task directory contains:
- `timeline.json` — **read this first.** The merged, time-ordered brief. Its
  top-level `frames` array lists full-viewport screenshots taken at start/resume
  (each PNG has a semi-transparent **coordinate grid every 50px** baked in — use
  it to map event x/y to what's on screen).
- `transcript.json` — Whisper transcript with per-segment timestamps.
- `events.json` — raw pointer/click/rect/frame events (clicks include the DOM
  ancestor chain: tag · id · classes · text).
- `audio.webm` — the original audio (only if you need to re-listen).
- `snaps/*.png` — `frame-*` full-page grids (start/resume) and `snap-*` region
  screenshots. Region shots include **100px of padding** around the selection
  with the **user's rectangle drawn on top**, so you see the target in context.

## 3. Claim a task

Don't touch the dropbox directories yourself — let the server do it. Run:

```bash
npx @getpixel/server watch
```

It **blocks until a task is ready** (a recording fully uploaded *and* transcribed,
or a saved edit), then atomically claims it (oldest first, multi-agent safe) and
prints one JSON line:

```json
{"id":"20260613-175521-404-oauonr","dir":"/abs/path/.pixel/working/<id>"}
```

`dir` is where the task now lives. Read it from `<dir>` (see step 4). Because it
blocks, this is also your watch loop — see step 6 for how to run it.

## 4. Read the task

**First check whether the task is a _saved edit_ or a _recording_** — they need
different handling, and you should describe to the user what actually landed
(e.g. "A saved edit batch landed (3 changes) — applying them" or "A new recording
landed — reading the brief"). Don't call an edit a recording.

If `<dir>` contains an `edits.json`, it's a **Save from edit mode** — a direct
batch of visual changes the user made in the running app (no audio/beats). Apply
those to source instead of
interpreting a spoken brief:

`edits.json` = `{ url, createdAt, changes: [...] }`. Each change is:

- `target` — the element's DOM ancestor chain (outermost → innermost), the **same
  shape as a recording click target** (`tag` · `id` · `classes` · `text`). The
  **last** entry is the edited element itself. Use it to locate the element in
  source (match by tag + classes/id + text, narrowing with ancestors).
- `kind` — `"style"` (a CSS property), `"text"` (text content), `"attr"` (an
  attribute), or `"move"` (reordered within its parent — `before`/`after` are
  child indices).
- `name` — the CSS property (e.g. `padding-left`) or attribute name; empty for
  `text`/`move`.
- `before` / `after` — the previous and new value. **Apply `after`** to the source
  (set the style/text/attribute, or reorder the element). `before` is for context
  / conflict-checking. Group changes by element; later changes to the same
  (element, property) supersede earlier ones.
- `source` — **present only when the value was bound to a design token** (the user
  picked a token in the design pane, or a drag snapped to one). When present,
  **write the token's symbolic form in source, NOT the resolved `after` value** —
  that's the whole point: keep edits on the design system. `source` is
  `{ tokenId, tokenName, usage, resolvedValue }`; spell it from `usage`:
  - `{ kind: 'utility', className: 'bg-primary' }` → use the Tailwind/shadcn class
    (`className="… bg-primary"`), adapting the verb to the property where needed
    (a color token is `bg-`/`text-`/`border-` by what it sets; `rounded-…` for
    radius, `p-`/`m-`/`gap-` for spacing).
  - `{ kind: 'css-var', expr: 'var(--brand-coral)' }` → write the `var(...)` expr
    as the CSS value.
  - `{ kind: 'theme-path', path: 'palette.primary.main', importHint }` → reference
    the theme path (MUI/Chakra), adding the import if `importHint` is given.

  `resolvedValue` (== `after`) is the fallback if the symbolic form genuinely can't
  be applied at that site. Prefer the symbolic form.

Make the edits durable in the codebase (the user already sees them applied live in
their app — your job is to write them into the source so they persist), then finish
exactly as in step 5 (`done <id> ...`). The rest of this step is for **recordings**.

Otherwise read `<dir>/timeline.json` (the `dir` from step 3). It's an array of
**beats** in time order:

- `kind: "speech"` — `text` is what the user said in that span, and `items` are
  the clicks/rects that happened during (or within 500ms of) it. This is the
  core: *what they said* paired with *what they were pointing at*.
- `kind: "silence"` — clicks/rects with no narration nearby.

Each item is a `click` (with `summary` like `div.card > button.btn "Upgrade"` and
the innermost `element`), a `rect` (a selected region), or a `draw` (a freehand
Cmd+drag annotation). Both `rect` and `draw` carry a `snapshot` filename in
`snaps/` — **view the PNG**: it shows exactly what the user boxed or sketched.
`pointerCount` summarizes mouse movement.

Treat the speech as the instruction and the clicked elements / selected regions
as the *where*. Example beat → "make this tighter" + a click on
`button.btn "Upgrade"` means: change that button.

## 5. Do the work, then finish

Implement the request in the current repo (edit code, run what's needed). When
done, mark the task finished — this writes `result.json` and moves it to
`done/` so it isn't reprocessed:

```bash
npx @getpixel/server done <id> --status ok --summary "<one line>" --files a.ts,b.ts
```

If you couldn't complete it, use `--status error --message "<why>"` instead; it
still moves to `done/`.

## 6. Watch loop (default)

You **cannot watch files passively.** When you end a turn, nothing wakes you — so
"I'm now watching" followed by stopping means you miss every task. The watch
*is* a running `watch` command, not a state of mind.

The instant the server is up, run `npx @getpixel/server watch` **in the
background** (`run_in_background: true`). It blocks until a task is ready, then
claims and prints it (step 3) — and because it claims the **oldest** ready task,
it also drains any backlog that piled up before you started. The harness
re-invokes you when it exits, so the user can still talk to you while it waits.

The loop:

1. Start `watch` in the background.
2. When it exits, read the printed `{id, dir}`, process the task (steps 4 → 5:
   read `<dir>/` — `edits.json` or `timeline.json` — do the work, `done <id> ...`).
3. Start `watch` again and wait. Repeat forever.

The running `watch` *is* the loop — never replace it with a passive "waiting"
message and then stop.

**Stop only when the user explicitly asks** ("stop", "stop pixel", "stop
watching"). Then kill the running `watch`, exit the loop, and leave the server
as-is (or stop it if they ask). Don't stop just because the inbox is momentarily
empty — `watch` keeps blocking until the next task.

## Enabling pixel-react time-travel (when asked)

If the user asks to enable **time travel / state history** (the rewind-clock in
the bar), the app must route its `react` through **pixel-react**. Two edits,
**dev only** — full walkthrough in the README ("Time travel — state history"):

1. **Alias the React import** in the bundler for the app's `src/` **only** (not
   `node_modules`): `react` → `@getpixel/ui/pixel-react`. Scope by source path,
   not "exclude node_modules" — Vite's dep pre-bundling leaks a substring
   exclusion into `@getpixel/ui` and captures Pixel's own UI. See the README's
   `pixelReactAlias` Vite plugin.
2. **Wrap the app content** in `<PixelStateRoot enabled={DEV}>…</PixelStateRoot>`,
   keeping `<Overlay />` outside it. Remove `<React.StrictMode>` around aliased
   app code (its double-invoke desyncs capture).

Client components only; state capture is in-memory (newest 50), session-scoped.
