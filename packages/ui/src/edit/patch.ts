/**
 * Patch primitive — applies a single DOM mutation to an element inside a
 * story tile's shadow root. Pure mutation; no snapshotting, queueing, or
 * event dispatch. Those layers sit above this module.
 *
 * See tech-specs/visual-changes.md §3.2.
 */

import type { TokenSource } from '../pixel-common'

export type Patch =
  | { kind: 'setText'; newText: string }
  | { kind: 'setAttr'; name: string; value: string | null }
  | {
      kind: 'setStyle'
      property: string
      value: string
      /** Set when this value came from a design-token pick / snap / bind. The
       *  reporter forwards it on the `Change` so the agent writes the symbolic
       *  spelling in source instead of the resolved value. */
      source?: TokenSource
    }

/**
 * Pre-hook invoked right before the mutation runs. Receives the element in
 * its pre-patch state, so subscribers can capture "before" snapshots.
 */
export type PatchPreHook = (element: Element, patch: Patch) => void
let preHook: PatchPreHook | null = null

export function setPatchPreHook(hook: PatchPreHook | null): void {
  preHook = hook
}

/**
 * Silent mode: when true, `applyPatch` still mutates the DOM but skips the
 * pre-hook so the change reporter doesn't open a new session.
 *
 * Two callers flip this:
 *  - **Drag gestures** (tech-specs/drag-to-resize.md §3) silence the reporter
 *    for per-frame patches via `setPatchSilent` and commit once on pointer up.
 *  - **`applyPatchAll`** silences the reporter while fanning a multi-edit
 *    patch over peer elements so the gesture produces N DOM mutations but
 *    exactly one agent call (multi-edit.md §6).
 */
let silent = false

export function setPatchSilent(value: boolean): void {
  silent = value
}

export function applyPatch(element: Element, patch: Patch): void {
  if (preHook && !silent) {
    try {
      preHook(element, patch)
    } catch {
      /* reporter must never break the patch */
    }
  }
  applyPatchInternal(element, patch)
}

/**
 * Apply the same patch to every element in `elements`. The first element
 * goes through whatever silent state is already in effect (so a drag that's
 * silenced its frames keeps every fan-out call silent too); subsequent
 * elements always run silent so they don't each open their own session.
 * The flag is saved + restored so `applyPatchAll` is safe to run inside an
 * outer drag without leaking the silent state on exit.
 */
export function applyPatchAll(elements: readonly Element[], patch: Patch): void {
  if (elements.length === 0) return
  applyPatch(elements[0], patch)
  if (elements.length === 1) return
  const prev = silent
  silent = true
  try {
    for (let i = 1; i < elements.length; i++) {
      applyPatch(elements[i], patch)
    }
  } finally {
    silent = prev
  }
}

function applyPatchInternal(element: Element, patch: Patch): void {
  switch (patch.kind) {
    case 'setText': {
      element.textContent = patch.newText
      return
    }
    case 'setAttr': {
      if (patch.value === null) {
        element.removeAttribute(patch.name)
      } else {
        element.setAttribute(patch.name, patch.value)
      }
      return
    }
    case 'setStyle': {
      // CSSOM setter: surgical, preserves other inline properties. An empty
      // string removes the property; setProperty('', '') is a no-op.
      const styleEl = element as HTMLElement | SVGElement
      if (patch.value === '') {
        styleEl.style.removeProperty(patch.property)
      } else {
        styleEl.style.setProperty(patch.property, patch.value)
      }
      return
    }
  }
}
