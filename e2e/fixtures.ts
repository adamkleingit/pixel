import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'

// Shared constants for the e2e harness — imported by both playwright.config.ts
// (to launch the servers) and the spec (to read the artifacts they produce).

const HERE = dirname(fileURLToPath(import.meta.url))

/** Dedicated test ports so the harness never collides with a real `npm run dev`.
 *  Offset from main's 41790/5181 so this worktree's e2e can run in parallel with
 *  the main checkout's (the two share a machine during the refactor). */
export const SERVER_PORT = 41890
export const EXAMPLE_PORT = 5281
export const SERVER_URL = `http://localhost:${SERVER_PORT}`
export const EXAMPLE_URL = `http://localhost:${EXAMPLE_PORT}`

/** Isolated dropbox the test server writes into (gitignored, wiped per run). */
export const PIXEL_DIR = join(HERE, '.artifacts', 'pixel')
export const INBOX_DIR = join(PIXEL_DIR, 'inbox')

/** The example app dir — its `globals.css` is the token source the server
 *  extracts from (pointed at via PIXEL_PROJECT_DIR in the harness). */
export const EXAMPLE_DIR = join(HERE, '..', 'examples', 'basic')

/** The fixed transcript the mock transcriber returns instead of running Whisper. */
export const TRANSCRIPT_FIXTURE = join(HERE, 'transcript.fixture.json')

/**
 * Wait for layout to stop reflowing before reading drag geometry. Entering edit
 * mode / selecting docks the design pane, whose slide-in progressively reflows
 * the page (the flex toolbars re-wrap as the body narrows) for a few frames.
 * A drag that reads an element box mid-reflow lands on stale coordinates and
 * misses its target. Polls the document height until it's stable across several
 * consecutive frames — deterministic, and resolves as soon as motion stops.
 */
export async function settleLayout(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = -1
        let stable = 0
        const tick = () => {
          const h = document.documentElement.scrollHeight
          if (h === last) {
            if (++stable >= 5) return resolve()
          } else {
            stable = 0
            last = h
          }
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
  )
}

/**
 * Read a locator's bounding box only once it stops moving. The resize/spacing
 * handles are body-portaled own-UI positioned over the selected element; they
 * can keep re-settling for a frame or two after the document height stabilizes
 * (a React effect repositions them). Polling until two consecutive reads agree
 * guarantees the drag starts on the handle, not just next to where it briefly
 * was — the difference between a resize and a no-op under load.
 */
export async function stableBox(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  let prev: { x: number; y: number; width: number; height: number } | null = null
  for (let i = 0; i < 40; i++) {
    const b = await locator.boundingBox()
    if (
      b &&
      prev &&
      b.x === prev.x &&
      b.y === prev.y &&
      b.width === prev.width &&
      b.height === prev.height
    ) {
      return b
    }
    prev = b
    await locator.page().waitForTimeout(50)
  }
  if (!prev) throw new Error('stableBox: locator has no bounding box')
  return prev
}
