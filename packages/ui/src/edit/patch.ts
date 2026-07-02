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
 *  - **Drag gestures** are the only remaining caller; `applyPatchAll` itself no
 *    longer forces silence (see its doc).
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
 * Apply the same patch to every element in `elements`, each through the current
 * silent state. Every element is reported (unless an outer drag has silenced the
 * reporter), so the change tracker captures a before/after for *each* peer — the
 * reporter coalesces same-property reports from one gesture into a single,
 * atomic undo entry (see `flushPending`). That keeps multi-edit undo correct: one
 * undo reverts the change on every selected element, not just the first.
 */
export function applyPatchAll(elements: readonly Element[], patch: Patch): void {
  for (const el of elements) applyPatch(el, patch)
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
