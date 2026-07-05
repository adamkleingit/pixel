import type { Recorder } from './recorder'
import type { Recording } from './types'

/**
 * The live recording, parked on a `globalThis` singleton so it survives a
 * remount of `PixelProvider` within the same document — most notably a
 * Storybook story switch, which tears down and rebuilds the decorated subtree
 * but keeps the preview iframe (and thus the JS heap and this singleton) alive.
 * A fresh provider adopts whatever is here instead of starting over.
 *
 * Continuity relies on `performance.now()` being monotonic for the life of the
 * document (the Recorder's clock is anchored to it). A full document reload —
 * HMR after a file edit, or a manual refresh — resets `performance.now()` and
 * drops the live mic stream, so it necessarily ends the recording. That's the
 * one unsupported case; everything short of a reload is preserved.
 */
export interface ActiveSession {
  recorder: Recorder
  state: 'recording' | 'paused'
  passthrough: boolean
  /** A finished recording awaiting resend after a failed save, if any. */
  pending?: Recording | null
  /** Human-readable save-failure message, if any. */
  saveError?: string | null
}

// Symbol.for keeps the key stable across module instances (duplicate copies of
// the package, ESM/CJS interop) so they all see the same session.
const KEY = Symbol.for('@getpixel/ui.activeSession')

type Host = { [KEY]?: ActiveSession }

/** The global object, or undefined under SSR / non-browser — keeps imports safe in Node. */
function host(): Host | undefined {
  if (typeof globalThis === 'undefined') return undefined
  return globalThis as unknown as Host
}

export function getActiveSession(): ActiveSession | undefined {
  return host()?.[KEY]
}

export function setActiveSession(session: ActiveSession): void {
  const h = host()
  if (h) h[KEY] = session
}

/** Shallow-merge a patch into the current session. No-op if there's no session. */
export function updateActiveSession(patch: Partial<ActiveSession>): void {
  const h = host()
  const current = h?.[KEY]
  if (h && current) h[KEY] = { ...current, ...patch }
}

export function clearActiveSession(): void {
  const h = host()
  if (h) delete h[KEY]
}
