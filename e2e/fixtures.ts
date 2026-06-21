import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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
export const SCREENSHARE_DIR = join(HERE, '.artifacts', 'screenshare')
export const INBOX_DIR = join(SCREENSHARE_DIR, 'inbox')

/** The fixed transcript the mock transcriber returns instead of running Whisper. */
export const TRANSCRIPT_FIXTURE = join(HERE, 'transcript.fixture.json')
