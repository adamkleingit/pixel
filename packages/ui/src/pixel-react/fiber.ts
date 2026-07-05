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
 */
import * as React from 'react'

interface Fiber {
  type: unknown
  index: number
  return: Fiber | null
}

interface SharedInternals {
  ReactCurrentOwner?: { current: Fiber | null }
}

const internals = (React as unknown as {
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED?: SharedInternals
}).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED

let warnedNoFiber = false

/** The fiber for the component currently rendering, or null if unavailable. */
export function currentFiber(): Fiber | null {
  const owner = internals?.ReactCurrentOwner?.current ?? null
  if (!owner && !warnedNoFiber) {
    warnedNoFiber = true
    // eslint-disable-next-line no-console
    console.warn(
      '[pixel-react] React current-owner fiber is unavailable — state capture ' +
        'falls back to a single flat key and may misalign. (React internals moved?)',
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
    }
    f = f.return
  }
  return segs.reverse().join('/')
}
