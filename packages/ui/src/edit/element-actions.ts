/**
 * Element-level structural actions — delete and duplicate the selected
 * element(s). Ported from Pixel desktop's `element-actions.ts`, adapted to the
 * in-app edit-history model: instead of shipping a `Change` to the agent over
 * RPC, each action returns the `Change[]` for `editHistory.commit`, so the
 * mutation is instantly previewed AND fully reversible (one undo per gesture)
 * through the same pipeline the design pane and drag gestures use.
 *
 *   - **delete** → one `remove` change per target; undo re-inserts it.
 *   - **duplicate** → clone each target and emit an `insert` change placing the
 *     copy directly after the original; undo removes the clone.
 *
 * Both act on the whole selection, reduced to the *topmost* elements so a
 * parent + one of its descendants selected together isn't acted on twice
 * (deleting the parent already takes the child; cloning the parent already
 * clones the child).
 */

import type { Change } from './edit-history'

export interface ElementActionResult {
  /** Changes to hand to `editHistory.commit` (one atomic, reversible entry). */
  changes: Change[]
  /** Human label for the change log. */
  label: string
  /** Elements the caller should select afterwards — the clones for duplicate,
   *  empty for delete (nothing left to select). */
  select: HTMLElement[]
}

/** Keep only elements not contained by another element in the set. */
function topmost(els: HTMLElement[]): HTMLElement[] {
  return els.filter((el) => !els.some((other) => other !== el && other.contains(el)))
}

/** Elements eligible for a structural action: topmost, still attached, and not
 *  the document root (which has no parent to re-insert into on undo). */
function actionable(els: HTMLElement[]): HTMLElement[] {
  return topmost(els).filter((el) => el.parentElement !== null)
}

/** Remove every selected element. Undo re-inserts each at its recorded slot. */
export function deleteElements(els: HTMLElement[]): ElementActionResult | null {
  const targets = actionable(els)
  if (targets.length === 0) return null
  const changes: Change[] = targets.map((el) => ({
    target: el,
    kind: 'remove',
    name: '',
    before: '',
    after: '',
    parent: el.parentElement!,
    anchor: el.nextSibling,
  }))
  return { changes, label: targets.length > 1 ? `delete ${targets.length} elements` : 'delete', select: [] }
}

/** Clone every selected element in place (copy inserted right after the
 *  original) and return the clones so the caller can route selection to them. */
export function duplicateElements(els: HTMLElement[]): ElementActionResult | null {
  const targets = actionable(els)
  if (targets.length === 0) return null
  const clones: HTMLElement[] = []
  const changes: Change[] = targets.map((el) => {
    const clone = el.cloneNode(true) as HTMLElement
    clones.push(clone)
    return {
      target: clone,
      kind: 'insert' as const,
      name: '',
      before: '',
      after: '',
      parent: el.parentElement!,
      anchor: el.nextSibling,
    }
  })
  return {
    changes,
    label: targets.length > 1 ? `duplicate ${targets.length} elements` : 'duplicate',
    select: clones,
  }
}
