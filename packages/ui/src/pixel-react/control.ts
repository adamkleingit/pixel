/**
 * Time-travel control — orchestrates the store mode with a *remount generation*.
 *
 * Injected hook values only "stick" on a fresh mount (a live component ignores an
 * injected value after its first render). So freezing to a frame, or restoring
 * the pre-freeze state, works by (1) setting the store mode + active frame, then
 * (2) bumping a generation counter that `PixelStateRoot` uses as a React `key`,
 * remounting the app subtree so every hook re-reads through the new mode.
 *
 * This module is imported by BOTH the provider (to drive freeze/goto/cancel) and
 * `PixelStateRoot` (to subscribe to the generation). It shares the same
 * `globalThis` store singleton, so there is one generation across the app.
 */
import { captureLive, type Frame, setMode } from './store'

let gen = 0
const listeners = new Set<() => void>()

export function subscribeGen(fn: () => void): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function getGen(): number {
  return gen
}

function bumpGen(): void {
  gen++
  for (const fn of listeners) fn()
}

/** Freeze the app to a captured frame (suppress mode) and remount to apply it. */
export function freezeTo(frame: Frame): void {
  setMode('suppress', frame)
  bumpGen()
}

/**
 * Return to live: remount seeding `frame`'s values as initial state (restore
 * mode). `PixelStateRoot` flips the store back to capture once the mount commits,
 * so the app is interactive and monitoring again from the pre-freeze state.
 */
export function restoreLive(frame: Frame): void {
  setMode('restore', frame)
  bumpGen()
}

/** Called by PixelStateRoot after a restore mount commits — resume live capture. */
export function finishRestore(): void {
  setMode('capture', null)
}

/** Snapshot the current live state so a later cancel can restore it. */
export { captureLive }
