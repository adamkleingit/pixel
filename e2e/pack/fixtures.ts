import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Shared constants for the PACK smoke harness — imported by playwright.pack.config.ts
// (to launch the installed server + consumer app), scripts/pack-smoke-setup.mjs
// (to provision them), and the smoke spec (to read the dropbox the server writes).
//
// This harness is deliberately separate from the workspace-linked e2e suite: it
// installs @getpixel/ui + @getpixel/server as PUBLISHED tarballs into a clean app
// OUTSIDE the npm workspace, so it catches packaging regressions the linked suite
// can't — a missing `files` entry, a broken `exports`/`bin`, a missing runtime dep.

const HERE = dirname(fileURLToPath(import.meta.url))

/** Dedicated ports, offset from the linked e2e suite (41890/5281) so both can run
 *  side by side without colliding. */
export const SERVER_PORT = 41990
export const APP_PORT = 5390
export const SERVER_URL = `http://localhost:${SERVER_PORT}`
export const APP_URL = `http://localhost:${APP_PORT}`

/** The committed consumer-app template that gets installed against the tarballs. */
export const FIXTURE_APP_DIR = join(HERE, 'fixture-app')

/** Where the setup script provisions the clean install (gitignored, wiped per run). */
export const APP_DIR = join(HERE, '.app')

/** The installed server's dropbox for this run (gitignored, wiped per run). */
export const PIXEL_DIR = join(HERE, '.artifacts', 'pixel')
export const INBOX_DIR = join(PIXEL_DIR, 'inbox')
