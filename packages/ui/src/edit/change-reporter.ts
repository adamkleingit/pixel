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

type CommitFn = (changes: EditChange[], label?: string) => void

let injectedCommit: CommitFn | null = null

/** Map a CSS/text/attr property name to the tracker's change surface. */
function mapProperty(property: string): { kind: EditChange['kind']; name: string } {
  if (property === 'text') return { kind: 'text', name: '' }
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

type Pending = { target: HTMLElement; kind: EditChange['kind']; name: string; before: string }
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
  pending.forEach((p) => {
    if (!commit) return
    const after = readValue(p.target, p.kind, p.name)
    if (after !== p.before) {
      commit([{ target: p.target, kind: p.kind, name: p.name, before: p.before, after }], p.name || p.kind)
    }
  })
  pending.clear()
}

/**
 * Pre-hook fired by `applyPatch` just before the mutation. Captures the
 * pre-mutation value (once per gesture) and schedules a coalesced commit.
 */
export function reportPatch(element: Element, patch: Patch): void {
  if (!injectedCommit || !(element instanceof HTMLElement)) return
  const { kind, name } = mapPatch(patch)
  const key = `${elementId(element)}:${kind}:${name}`
  if (!pending.has(key)) {
    pending.set(key, { target: element, kind, name, before: readValue(element, kind, name) })
  }
  scheduleFlush()
}

/** Drag gestures commit the net change(s) on pointer-up as one atomic entry. */
export function commitChangeBatch(args: { element: Element; htmlBefore: string; changes: Change[] }): void {
  const commit = injectedCommit
  if (!commit || !(args.element instanceof HTMLElement)) return
  const el = args.element
  const mapped: EditChange[] = args.changes
    .filter((c) => c.property !== '__remove__')
    .map((c) => {
      const { kind, name } = mapProperty(c.property)
      return { target: el, kind, name, before: c.previousValue, after: c.newValue }
    })
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
