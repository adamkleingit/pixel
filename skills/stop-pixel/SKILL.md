---
name: stop-pixel
description: >
  Stop the Pixel watch loop. Use when the user says "stop pixel", "stop
  watching", "stop the pixel tracker/watcher", or otherwise asks to stop picking
  up Pixel recordings/edits. Kills the running `@getpixel/server watch` process
  started by the `pixel` skill and exits the loop.
---

# Stop Pixel

The user wants to stop watching for Pixel tasks. The watch loop from the `pixel`
skill **is** a running `@getpixel/server watch` process (usually a background
task) — "stopping" only in your head does nothing, so you must actually kill it.

1. **Find the running watch.** It's the background task you (or a prior turn)
   started with `npx @getpixel/server watch`. Check your own background tasks
   first; otherwise look it up:

   ```bash
   pgrep -fl "@getpixel/server watch"    # or: ps aux | grep "server watch" | grep -v grep
   ```

2. **Kill it.** Stop that background task (or `kill <pid>`). If nothing is
   running, say so plainly — there's no watch loop to stop.

3. **Exit the loop.** Do **not** start `watch` again. Confirm to the user that
   you've stopped watching.

4. **Leave the ingest server (`@getpixel/server`) running** so recordings still
   land on disk for next time — **unless** the user explicitly asks to stop the
   server too, in which case kill that process as well.

Nothing else is torn down: any task already claimed under `.pixel/working/`
stays there and will be picked up when watching resumes.
