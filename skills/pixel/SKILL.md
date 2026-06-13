---
name: pixel
description: >
  Pick up Screenshare recordings (voice + clicks + selected regions) dropped on
  disk and act on them as implementation briefs. Use when the user says "pixel",
  "start pixel", "check for recordings", "watch screenshare", "process my
  recording", or points you at a .screenshare dropbox folder. On "pixel" / "start
  pixel", start the ingest server and watch for recordings (steps 1 → 6). Each
  recording is a spoken request grounded in the elements the user clicked and the
  regions they selected.
---

# Screenshare watch

Screenshare records a short session — microphone audio (transcribed), mouse
movements/clicks, and drag-selected regions (with screenshots) — and drops it
into an on-disk **dropbox**. Your job is to claim a new recording, understand it
as a brief, and carry it out in the current codebase.

**"pixel" / "start pixel"** — start the ingest server (step 1), then **tell the
user how to record** (verbatim):

```
1. Start recording by double-tapping **Space** inside your app
2. Describe your changes. Single **Space** to pause/resume, double **Space** to finish, **Esc** to cancel
3. I (your agent) will do the rest
```

Then enter the **watch loop** (step 6) and stay in it: first **drain** any
recordings already waiting in the inbox, then **block** until the next one lands,
claiming (step 3), reading (step 4), and doing the work (step 5) for each.
**Looping is the default — keep watching until the user explicitly asks you to
stop.**

## 1. Make sure the ingest server is running

Recordings only land on disk if `@getpixel/server` is running (it writes the dropbox
and transcribes audio). If nothing is recording or no `.screenshare/` exists yet,
start it (it stays up; run it in the background):

```bash
npx @getpixel/server        # http://localhost:41789 → writes .screenshare/inbox/<id>/
```

Set `SCREENSHARE_DIR` to control where it writes, and `SCREENSHARE_WHISPER_LANG`
(e.g. `hebrew`) if narration isn't English.

> **If Pixel isn't installed or isn't configured correctly** (the command fails,
> the package is missing, or the server won't start), follow the project README to
> install and set it up first — then come back here, run the server, and continue
> listening for file changes.
>
> This skill ships **inside** `@getpixel/server`. To (re)install the copy that matches
> your installed package version, run `npx @getpixel/server install-skill` (writes
> `.claude/skills/pixel/`; add `--global` for `~/.claude/skills`). That
> keeps the skill and the server in lockstep on the same version.

## 2. Find the dropbox

Look for the `.screenshare/` directory (default at the project root). It contains:

```
.screenshare/
  inbox/<id>/      ← new, unclaimed recordings
  working/<id>/    ← currently being handled (you create this)
  done/<id>/       ← finished (you create this)
```

If you can't find it, ask the user for the path (it's wherever they ran
`@getpixel/server`, honoring `SCREENSHARE_DIR`).

A recording directory contains:
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

## 3. Claim a recording

Don't touch the dropbox directories yourself — let the server do it. Run:

```bash
npx @getpixel/server watch
```

It **blocks until a recording is ready** (fully uploaded *and* transcribed), then
atomically claims it (oldest first, multi-agent safe) and prints one JSON line:

```json
{"id":"20260613-175521-404-oauonr","dir":"/abs/path/.screenshare/working/<id>"}
```

`dir` is where the recording now lives. Read your brief from `<dir>/timeline.json`
(see step 4). Because it blocks, this is also your watch loop — see step 6 for how
to run it.

## 4. Read the brief

Read `<dir>/timeline.json` (the `dir` from step 3). It's an array of **beats** in
time order:

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
done, mark the recording finished — this writes `result.json` and moves it to
`done/` so it isn't reprocessed:

```bash
npx @getpixel/server done <id> --status ok --summary "<one line>" --files a.ts,b.ts
```

If you couldn't complete it, use `--status error --message "<why>"` instead; it
still moves to `done/`.

## 6. Watch loop (default)

You **cannot watch files passively.** When you end a turn, nothing wakes you — so
"I'm now watching" followed by stopping means you miss every recording. The watch
*is* a running `watch` command, not a state of mind.

The instant the server is up, run `npx @getpixel/server watch` **in the
background** (`run_in_background: true`). It blocks until a recording is ready,
then claims and prints it (step 3) — and because it claims the **oldest** ready
recording, it also drains any backlog that piled up before you started. The
harness re-invokes you when it exits, so the user can still talk to you while it
waits.

The loop:

1. Start `watch` in the background.
2. When it exits, read the printed `{id, dir}`, process the recording (steps 4 →
   5: read `<dir>/timeline.json`, do the work, `done <id> ...`).
3. Start `watch` again and wait. Repeat forever.

The running `watch` *is* the loop — never replace it with a passive "waiting"
message and then stop.

**Stop only when the user explicitly asks** ("stop", "stop pixel", "stop
watching"). Then kill the running `watch`, exit the loop, and leave the server
as-is (or stop it if they ask). Don't stop just because the inbox is momentarily
empty — `watch` keeps blocking until the next recording.
