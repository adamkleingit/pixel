/**
 * HMR guard — defers Vite hot updates (react-refresh) *and* full reloads while
 * an edit or recording session is active, then applies everything at once when
 * the session ends. Without it, a dev-server rebuild mid-session would:
 *   - wipe in-progress in-DOM edits (react-refresh re-renders off source), or
 *   - reset `performance.now()` + drop the mic stream on a full reload, which
 *     ends the recording (see session.ts).
 *
 * The SDK can't touch the host app's `import.meta.hot` itself — that binding is
 * per-module and belongs to the app's entry file. So integration is two halves:
 *   1. The host wires Vite's HMR once, in its entry:
 *          if (import.meta.hot) installHmrGuard(import.meta.hot)
 *   2. The provider opens/closes the gate via `setHmrSessionActive` as editing
 *      and recording start and stop.
 *
 * While the gate is open, hot updates and full reloads are aborted and a single
 * pending flag is set; the moment it closes, one `location.reload()` replays
 * whatever the dev server changed meanwhile (so a Save that made the agent
 * rewrite source, or any stray file change, lands cleanly). If the host never
 * wires step 1, `setHmrSessionActive` is a harmless no-op flag — the SDK still
 * works, it just doesn't hold back HMR.
 */

let sessionActive = false
let reloadPending = false

/** Minimal shape of Vite's `import.meta.hot` — only what the guard consumes. */
export interface HotContext {
  on(event: string, cb: (payload: unknown) => void): void
}

/**
 * Open (`true`) or close (`false`) the HMR gate. Closing it with a deferred
 * change pending performs the single catch-up reload. Idempotent.
 */
export function setHmrSessionActive(active: boolean): void {
  if (active === sessionActive) return
  sessionActive = active
  if (!active && reloadPending) {
    reloadPending = false
    if (typeof location !== 'undefined') location.reload()
  }
}

export function isHmrSessionActive(): boolean {
  return sessionActive
}

/**
 * Called from the host's HMR hooks. Returns true when the event must be deferred
 * (a session is active) — the caller then aborts Vite's update by throwing, and
 * the change is remembered for a single reload at session end.
 */
export function shouldDeferHmr(): boolean {
  if (!sessionActive) return false
  reloadPending = true
  return true
}

/**
 * Wire Vite's HMR to the guard. Call once from the app entry:
 *
 *     if (import.meta.hot) installHmrGuard(import.meta.hot)
 *
 * While an edit/recording session is active, hot updates and full reloads are
 * aborted and coalesced into one `location.reload()` fired when the session
 * ends. No-op in production (no `hot`).
 */
export function installHmrGuard(hot: HotContext | undefined | null | false): void {
  if (!hot) return
  const defer = (what: string) => () => {
    if (shouldDeferHmr()) {
      // Throwing here aborts Vite's pending update / full reload. The deferred
      // change is replayed as one location.reload() when the session ends.
      throw new Error(`[pixel] ${what} deferred until the edit/recording session ends`)
    }
  }
  hot.on('vite:beforeUpdate', defer('HMR update'))
  hot.on('vite:beforeFullReload', defer('full reload'))
}
