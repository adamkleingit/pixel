---
name: screenshare-watch
description: >
  Pick up Screenshare recordings (voice + clicks + selected regions) dropped on
  disk and act on them as implementation briefs. Use when the user says "check
  for recordings", "watch screenshare", "process my recording", or points you at
  a .screenshare dropbox folder. Each recording is a spoken request grounded in
  the elements the user clicked and the regions they selected.
---

# Screenshare watch

Screenshare records a short session — microphone audio (transcribed), mouse
movements/clicks, and drag-selected regions (with screenshots) — and drops it
into an on-disk **dropbox**. Your job is to claim a new recording, understand it
as a brief, and carry it out in the current codebase.

## 1. Make sure the ingest server is running

Recordings only land on disk if `@pixel/server` is running (it writes the dropbox
and transcribes audio). If nothing is recording or no `.screenshare/` exists yet,
start it (it stays up; run it in the background):

```bash
npx @pixel/server        # http://localhost:41789 → writes .screenshare/inbox/<id>/
```

Set `SCREENSHARE_DIR` to control where it writes, and `SCREENSHARE_WHISPER_LANG`
(e.g. `hebrew`) if narration isn't English.

## 2. Find the dropbox

Look for the `.screenshare/` directory (default at the project root). It contains:

```
.screenshare/
  inbox/<id>/      ← new, unclaimed recordings
  working/<id>/    ← currently being handled (you create this)
  done/<id>/       ← finished (you create this)
```

If you can't find it, ask the user for the path (it's wherever they ran
`@pixel/server`, honoring `SCREENSHARE_DIR`).

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

## 3. Claim a recording (atomic, multi-agent safe)

Claim by renaming the directory — `mv` is atomic, so two agents can't grab the
same one:

```bash
DROP=.screenshare
ID=$(ls -t "$DROP/inbox" 2>/dev/null | head -1)   # oldest-first: use `ls -tr | head -1`
[ -n "$ID" ] || { echo "no recordings"; exit 0; }
mkdir -p "$DROP/working" "$DROP/done"
mv "$DROP/inbox/$ID" "$DROP/working/$ID" || { echo "already claimed"; exit 0; }
echo "claimed $ID"
```

## 4. Read the brief

Read `working/$ID/timeline.json`. It's an array of **beats** in time order:

- `kind: "speech"` — `text` is what the user said in that span, and `items` are
  the clicks/rects that happened during (or within 500ms of) it. This is the
  core: *what they said* paired with *what they were pointing at*.
- `kind: "silence"` — clicks/rects with no narration nearby.

Each item is a `click` (with `summary` like `div.card > button.btn "Upgrade"` and
the innermost `element`) or a `rect` (with the selected region and a `snapshot`
filename in `snaps/`). For rects, **view the PNG** — it shows exactly what the
user selected. `pointerCount` summarizes mouse movement.

Treat the speech as the instruction and the clicked elements / selected regions
as the *where*. Example beat → "make this tighter" + a click on
`button.btn "Upgrade"` means: change that button.

## 5. Do the work, then finish

Implement the request in the current repo (edit code, run what's needed). When
done, record a result and move the recording to `done/`:

```bash
cat > "$DROP/working/$ID/result.json" <<EOF
{ "status": "ok", "summary": "<one line>", "files": [<edited files>], "finishedAt": $(date +%s) }
EOF
mv "$DROP/working/$ID" "$DROP/done/$ID"
```

If you couldn't complete it, write `"status": "error"` with a `message` and still
move it to `done/` so it isn't reprocessed.

## 6. Looping

If asked to keep watching, repeat from step 3 (claim) whenever new recordings
appear in `inbox/`. Otherwise process the latest one and stop.
