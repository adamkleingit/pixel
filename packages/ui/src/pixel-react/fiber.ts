/**
 * Fiber access — read the component instance currently rendering, so pixel-react
 * can key each hook to a *stable, structural* identity (state-capture.md §6).
 *
 * Why structural: capture happens on the live tree; replay happens on a freshly
 * *remounted* tree (new fibers). A pointer key wouldn't survive the remount, so
 * we key by the instance's position in the component tree — its ancestor chain
 * of `componentName#childIndex`. Same tree shape → same keys → injection
 * realigns. This is the "flat counter, upgraded" from the spec: robust to
 * partial re-renders (each instance is keyed independently) without needing the
 * `data-pixel-id` build plugin (not installed in-app yet).
 *
 * We read React's current-owner fiber via the (private) shared-internals object.
 * It's the same access DevTools/bippy use; guarded so a React build that hides it
 * degrades to a single flat key rather than throwing.
 *
 * React moved that access in 19: `ReactCurrentOwner.current` became
 * `A.getOwner()` on the client internals, where `A` is the async dispatcher
 * react-dom installs and `getOwner()` returns the same DEV current-fiber
 * pointer. Both shapes are probed per call so one build of pixel-react works
 * across 18 and 19 — and so react-dom can install `A` after this module loads.
 */
import * as React from 'react'

interface Fiber {
  type: unknown
  index: number
  return: Fiber | null
}

/** React 18: the owner lives on a mutable cell in the legacy internals object. */
interface LegacyInternals {
  ReactCurrentOwner?: { current: Fiber | null }
}

/** React 19: the owner is read through the async dispatcher react-dom installs. */
interface ClientInternals {
  A?: { getOwner?: () => Fiber | null } | null
}

const reactInternals = React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: LegacyInternals
  __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE?: ClientInternals
}

let warnedNoFiber = false

/** The fiber for the component currently rendering, or null if unavailable. */
export function currentFiber(): Fiber | null {
  const legacy = reactInternals.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  const client = reactInternals.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
  const owner = legacy?.ReactCurrentOwner?.current ?? client?.A?.getOwner?.() ?? null
  if (!owner && !warnedNoFiber) {
    warnedNoFiber = true
    // eslint-disable-next-line no-console
    console.warn(
      '[pixel-react] React current-owner fiber is unavailable — state capture falls back ' +
        'to a single flat key and restore may misalign. Time-travel needs a development ' +
        'build of react-dom; production builds do not track the owner fiber.',
    )
  }
  return owner
}

function componentName(type: unknown): string {
  if (typeof type === 'function') {
    const fn = type as { displayName?: string; name?: string }
    return fn.displayName || fn.name || 'Anonymous'
  }
  // memo/forwardRef wrappers carry the inner render fn on `.render`/`.type`.
  if (type && typeof type === 'object') {
    const o = type as { displayName?: string; render?: { name?: string }; type?: { name?: string } }
    return o.displayName || o.render?.name || o.type?.name || 'Component'
  }
  return 'Component'
}

/** Mode fibers carry this as their `type`; it is neither a function nor an object. */
const STRICT_MODE_TYPE = Symbol.for('react.strict_mode')

let warnedStrictMode = false

/**
 * A stable structural key for the instance owning the fiber: the chain of
 * component ancestors as `Name#index`, root→leaf. Host (DOM) fibers are skipped
 * so the key tracks *component* identity, which is what hook arrays belong to.
 */
export function instanceKey(fiber: Fiber | null): string {
  if (!fiber) return '@root'
  const segs: string[] = []
  let f: Fiber | null = fiber
  while (f) {
    if (typeof f.type === 'function' || (f.type && typeof f.type === 'object')) {
      segs.push(`${componentName(f.type)}#${f.index}`)
    } else if (f.type === STRICT_MODE_TYPE && !warnedStrictMode) {
      warnedStrictMode = true
      // eslint-disable-next-line no-console
      console.warn(
        `[pixel-react] <${componentName(fiber.type)}> renders under <React.StrictMode>. ` +
          "StrictMode's dev double-invoke re-runs hooks against the same fiber, which " +
          'advances the capture cursor twice and misaligns time-travel frames. Turn ' +
          'strict mode off in development (Next: `reactStrictMode: false`, which ' +
          '`withPixel` does for you).',
      )
    }
    f = f.return
  }
  return segs.reverse().join('/')
}

/** Test seam: the strict-mode notice is one-shot per module instance. */
export function resetStrictModeWarning(): void {
  warnedStrictMode = false
}
