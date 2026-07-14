/**
 * change-reporter — in-app shim of Pixel's change reporter, preserving the
 * exact public surface the ported design pane + drag code call
 * (`reportPatch`, `commitChangeBatch`, …) but routing to the in-app change
 * tracker instead of the agent RPC.
 *
 * Two entry points, matching Pixel:
 *  - **`reportPatch`** is registered as the `patch` pre-hook (see the bridge in
 *    edit-history). Design sections call `applyPatch`/`applyPatchAll`, which
 *    fire this just before the DOM mutation — we capture the `before` value,
 *    debounce, and commit one tracker entry per (element, property) gesture so
 *    typing/sliding coalesces into a single undo step.
 *  - **`commitChangeBatch`** is called by drag gestures on pointer-up with the
 *    net before→after per touched property — we commit it as one atomic entry.
 *
 * The actual `commit`/`applyLive` come from `useEditHistory`, injected by the
 * bridge (`setReporterCommit`) while edit mode is mounted.
 */
import { setPatchPreHook, type Patch } from './patch'
import type { Change as EditChange } from './edit-history'
import type { Change, ElementLocator } from '../agent-client'
import type { TokenSource } from '../pixel-common'

type CommitFn = (changes: EditChange[], label?: string) => void

let injectedCommit: CommitFn | null = null

/** Map a CSS/text/attr property name to the tracker's change surface. */
function mapProperty(property: string): { kind: EditChange['kind']; name: string } {
  if (property === 'text') return { kind: 'text', name: '' }
  if (property === 'pixel-move-node') return { kind: 'move', name: '' }
  if (property === 'value' || property === 'placeholder') return { kind: 'attr', name: property }
  return { kind: 'style', name: property }
}

function mapPatch(patch: Patch): { kind: EditChange['kind']; name: string } {
  if (patch.kind === 'setText') return { kind: 'text', name: '' }
  if (patch.kind === 'setAttr') return { kind: 'attr', name: patch.name }
  return { kind: 'style', name: patch.property }
}

function readValue(el: HTMLElement, kind: EditChange['kind'], name: string): string {
  if (kind === 'style') return el.style.getPropertyValue(name)
  if (kind === 'text') return el.textContent ?? ''
  return el.getAttribute(name) ?? ''
}

// --- debounced pre-hook session (one entry per element+property gesture) -----

let idCounter = 0
const elementIds = new WeakMap<Element, number>()
function elementId(el: Element): number {
  let id = elementIds.get(el)
  if (id === undefined) {
    id = ++idCounter
    elementIds.set(el, id)
  }
  return id
}

type Pending = {
  target: HTMLElement
  kind: EditChange['kind']
  name: string
  before: string
  /** Token binding from the latest patch in this gesture (last write wins), so a
   *  picker/snap-bound edit commits with the symbolic spelling. */
  source?: TokenSource
}
const pending = new Map<string, Pending>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
const DEBOUNCE_MS = 350

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(flushPending, DEBOUNCE_MS)
}

function flushPending(): void {
  flushTimer = null
  const commit = injectedCommit
  if (!commit) {
    pending.clear()
    return
  }
  // Group this gesture's pending reports by surface (kind+property). A multi-edit
  // fan-out reports the SAME property across N peer elements; grouping commits
  // them as ONE atomic entry so a single undo reverts every selected element —
  // not just the first. Distinct properties stay distinct entries, preserving
  // per-property undo granularity for single-element edits.
  const groups = new Map<string, EditChange[]>()
  pending.forEach((p) => {
    const after = readValue(p.target, p.kind, p.name)
    if (after === p.before) return // no-op
    const change: EditChange = {
      target: p.target,
      kind: p.kind,
      name: p.name,
      before: p.before,
      after,
      source: p.source,
    }
    const key = `${p.kind}:${p.name}`
    const group = groups.get(key)
    if (group) group.push(change)
    else groups.set(key, [change])
  })
  pending.clear()
  groups.forEach((changes) => commit(changes, changes[0].name || changes[0].kind))
}

/** Apply a value straight to the live DOM (mirrors edit-history's `applyValue`),
 *  used to revert an in-flight session without going through a commit. */
function writeValue(el: HTMLElement, kind: EditChange['kind'], name: string, value: string): void {
  if (kind === 'style') {
    if (value === '') el.style.removeProperty(name)
    else el.style.setProperty(name, value)
  } else if (kind === 'text') {
    el.textContent = value
  } else if (kind === 'attr') {
    if (value === '') el.removeAttribute(name)
    else el.setAttribute(name, value)
  }
}

/**
 * Synchronously take every open (debounced, not-yet-committed) session as a
 * finished change and clear them — for **Save**, so an edit still inside the
 * 350ms window is included in the batch and can't fire a stray late commit
 * after edit mode exits. Returns only sessions whose value actually changed.
 */
export function drainPendingChanges(): EditChange[] {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  const out: EditChange[] = []
  pending.forEach((p) => {
    const after = readValue(p.target, p.kind, p.name)
    if (after !== p.before) {
      out.push({ target: p.target, kind: p.kind, name: p.name, before: p.before, after, source: p.source })
    }
  })
  pending.clear()
  return out
}

/** True when a debounced edit still differs from its pre-gesture value. */
export function hasPendingChanges(): boolean {
  for (const p of pending.values()) {
    if (readValue(p.target, p.kind, p.name) !== p.before) return true
  }
  return false
}

/**
 * Revert every open (debounced) session to its pre-gesture value and drop them —
 * for **Cancel**, so an edit made inside the debounce window is undone like any
 * committed one (and no stray late commit fires after exit). Called by the
 * history's `discard` *before* it reverts committed entries, so a property
 * edited more than once unwinds in the right order (in-flight → committed).
 */
export function revertPendingSessions(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  pending.forEach((p) => writeValue(p.target, p.kind, p.name, p.before))
  pending.clear()
}

/**
 * Pre-hook fired by `applyPatch` just before the mutation. Captures the
 * pre-mutation value (once per gesture) and schedules a coalesced commit.
 */
export function reportPatch(element: Element, patch: Patch): void {
  if (!injectedCommit || !(element instanceof HTMLElement)) return
  const { kind, name } = mapPatch(patch)
  const source = patch.kind === 'setStyle' ? patch.source : undefined
  const key = `${elementId(element)}:${kind}:${name}`
  if (!pending.has(key)) {
    pending.set(key, { target: element, kind, name, before: readValue(element, kind, name), source })
  } else {
    // Last write wins: a later patch in the same gesture may re-bind this
    // property to a token, or a raw edit may clear an earlier binding. The
    // committed `after` is read fresh at flush, so its source must track the
    // final patch.
    pending.get(key)!.source = source
  }
  scheduleFlush()
}

/**
 * Drag gestures commit the net change(s) on pointer-up as one atomic entry.
 *
 * Under multi-edit, the same style change is mirrored onto `peers` during the
 * drag; pass them (with `peerBefore` resolving each peer's pre-drag value for a
 * property) so every peer's before/after is folded into the SAME entry. One undo
 * then reverts the gesture on every selected element, not just the dragged one.
 */
export function commitChangeBatch(args: {
  element: Element
  htmlBefore: string
  changes: Change[]
  peers?: readonly Element[]
  /** Pre-drag value of `property` on `peer` (the undo target). */
  peerBefore?: (peer: Element, property: string) => string
}): void {
  const commit = injectedCommit
  if (!commit || !(args.element instanceof HTMLElement)) return
  const el = args.element
  const peers = args.peers ?? []
  const mapped: EditChange[] = []
  for (const c of args.changes) {
    if (c.property === '__remove__') continue
    const { kind, name } = mapProperty(c.property)
    mapped.push({ target: el, kind, name, before: c.previousValue, after: c.newValue, source: c.source })
    // Fan the same property onto each peer so undo reverts them too. Peers only
    // ever mirror style props (drag gestures), so read the live inline `after`.
    if (kind === 'style' && args.peerBefore) {
      for (const peer of peers) {
        if (!(peer instanceof HTMLElement)) continue
        const before = args.peerBefore(peer, name)
        const after = peer.style.getPropertyValue(name)
        if (before !== after) mapped.push({ target: peer, kind, name, before, after, source: c.source })
      }
    }
  }
  if (mapped.length) commit(mapped, args.changes[0]?.property ?? 'edit')
}

// --- bridge + parity stubs ---------------------------------------------------

/** Wire the tracker's commit in (and register/clear the patch pre-hook). Called
 *  by the edit-history bridge while edit mode is mounted. */
export function setReporterCommit(commit: CommitFn | null): void {
  injectedCommit = commit
  setPatchPreHook(commit ? reportPatch : null)
  if (!commit) {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
    pending.clear()
  }
}

// Parity stubs for the Pixel API surface (story/agent/remove paths unused in-app).
export function setChangeReporterContext(_next: unknown): void {}
export function commitRemove(_args: { element: Element; htmlBefore: string }): void {}
export function commitStoryChangeBatch(_args: { changes: Change[] }): void {}
export function flushOpenSessions(): void {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushPending()
  }
}
export function replayChange(_args: unknown): Promise<void> {
  return Promise.resolve()
}
export function locateElement(_el: Element, _root: Node): ElementLocator | null {
  return null
}
