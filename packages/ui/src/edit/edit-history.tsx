/**
 * Edit history — the in-app change tracker. Every edit (design-pane change,
 * inline text edit, a drag gesture) commits here as one entry of 1..N changes,
 * applied to the **live DOM**. This is the in-app analog of Pixel's
 * change-reporter + history: the canvas version dispatched each change to the
 * agent over RPC against a `data-pixel-id` source location; here we keep the
 * same "one gesture = one atomic, reversible entry" model but apply to the real
 * element and hold the batch in memory. A later step flushes the batch to the
 * coding agent on Save (see complete-refactor.md §3.2/§4.2).
 *
 * A `Change` is symmetric (before/after), so undo = apply `before`, redo =
 * apply `after` — mirroring Pixel's `DesignEntry`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TokenSource } from '../pixel-common'
import { revertPendingSessions, setReporterCommit } from './change-reporter'

export interface Change {
  target: HTMLElement
  /** What surface the value lives on. `move` reorders the element within its
   *  parent — `before`/`after` are DOM child indices (see reposition-drag's
   *  `pixel-move-node`). `html` replaces the element's innerHTML (mixed-content
   *  inline edit — a <p> with <span>/<strong> runs edited as raw markup).
   *  `insert` / `remove` are structural: `target` is the node added / removed;
   *  `parent` + `anchor` say where it lives so undo/redo can re-insert it. */
  kind: 'style' | 'text' | 'attr' | 'move' | 'html' | 'insert' | 'remove'
  /** style property (e.g. `padding-left`), attribute name, or '' for text/move/html/insert/remove. */
  name: string
  before: string
  after: string
  /** Set when `after` came from a design-token pick / snap / bind. Carried so the
   *  Save payload (and ultimately the coding agent) writes the symbolic spelling
   *  in source instead of the resolved value. Undo/redo ignore it — it only
   *  describes how `after` should be written back, not how it applies to the DOM. */
  source?: TokenSource
  /** Structural (`insert`/`remove`) only — the container `target` sits in. */
  parent?: HTMLElement
  /** Structural (`insert`/`remove`) only — the sibling `target` sits *before*
   *  in `parent` (null = appended last). Re-insertion falls back to append if
   *  the anchor has since detached. */
  anchor?: Node | null
}

export interface EditEntry {
  changes: Change[]
  /** Human label for the change log (e.g. "padding-left", "text"). */
  label: string
}

export interface EditHistory {
  /** Apply a value to the live DOM without recording (live drag/slider preview). */
  applyLive: (target: HTMLElement, kind: Change['kind'], name: string, value: string) => void
  /** Commit a gesture as one reversible entry (applies the `after` values). */
  commit: (changes: Change[], label?: string) => void
  undo: () => void
  redo: () => void
  /** Jump the history pointer to `target` (−1 = before all edits), applying the
   *  net undo/redo to the live DOM. Used by the edit-log to click-to-navigate. */
  goto: (target: number) => void
  canUndo: boolean
  canRedo: boolean
  /** The full change log, oldest → newest (applied AND redoable). */
  entries: EditEntry[]
  /** Index of the last APPLIED entry (−1 = none applied). Entries after it are
   *  the redo tail. */
  pointer: number
  /** Monotonic counter bumped whenever history NAVIGATION changes the live DOM
   *  out from under the pane — undo / redo / goto / discard (NOT plain commits,
   *  which happen while the user is actively editing). The design pane keys its
   *  re-read on this so its inputs re-derive from the DOM after an undo/redo and
   *  can never drift from what's actually applied. */
  navRevision: number
  /** The applied entries (start → pointer), in order — the batch for Save. */
  batch: EditEntry[]
  /** Drop all history without touching the DOM (after a successful Save — the
   *  edits stay applied; the agent will write them to source). */
  clear: () => void
  /** Revert every applied entry (newest → oldest) and drop all history (Cancel). */
  discard: () => void
}

/** Insert a structural change's `target` at its recorded `parent` + `anchor`.
 *  Falls back to append when the anchor has detached since capture. */
function insertNode(c: Change): void {
  const parent = c.parent
  if (!parent) return
  const anchor = c.anchor && c.anchor.parentNode === parent ? c.anchor : null
  parent.insertBefore(c.target, anchor)
}

/** Apply one change in a direction: `'after'` for commit/redo, `'before'` for
 *  undo. Structural kinds add / remove the node; value kinds delegate to
 *  `applyValue`. `insert` is present in the `after` state (absent in `before`);
 *  `remove` is the inverse. */
function applyChange(c: Change, dir: 'before' | 'after'): void {
  if (c.kind === 'insert') {
    if (dir === 'after') insertNode(c)
    else c.target.remove()
    return
  }
  if (c.kind === 'remove') {
    if (dir === 'after') c.target.remove()
    else insertNode(c)
    return
  }
  applyValue(c.target, c.kind, c.name, dir === 'after' ? c.after : c.before)
}

function applyValue(target: HTMLElement, kind: Change['kind'], name: string, value: string): void {
  if (kind === 'style') {
    if (value === '') target.style.removeProperty(name)
    else target.style.setProperty(name, value)
  } else if (kind === 'text') {
    target.textContent = value
  } else if (kind === 'html') {
    target.innerHTML = value
  } else if (kind === 'move') {
    // Reposition `target` to child index `value` within its parent. Compute the
    // reference against the siblings *excluding* target so the resulting index
    // is exactly `value` regardless of target's current position.
    const parent = target.parentElement
    if (!parent) return
    const index = Number(value)
    if (!Number.isFinite(index)) return
    const siblings = Array.from(parent.children).filter((c) => c !== target)
    parent.insertBefore(target, siblings[index] ?? null)
  } else {
    if (value === '') target.removeAttribute(name)
    else target.setAttribute(name, value)
  }
}

const Ctx = createContext<EditHistory | null>(null)

export function EditHistoryProvider({ children }: { children: ReactNode }) {
  // entries[0..pointer] are applied; entries after pointer are the redo tail.
  const [entries, setEntries] = useState<EditEntry[]>([])
  const [pointer, setPointer] = useState(-1)
  // Bumped on undo/redo/goto/discard (see EditHistory.navRevision).
  const [navRevision, setNavRevision] = useState(0)
  const bumpNav = useCallback(() => setNavRevision((n) => n + 1), [])
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const pointerRef = useRef(pointer)
  pointerRef.current = pointer

  const applyLive = useCallback(
    (target: HTMLElement, kind: Change['kind'], name: string, value: string) =>
      applyValue(target, kind, name, value),
    [],
  )

  // entriesRef/pointerRef are advanced synchronously (not just on the next
  // render) so multiple commits within one flush — e.g. a multi-property gesture
  // that commits one entry per property — chain off each other instead of each
  // reading a stale pointer and clobbering the previous entry.
  const commit = useCallback((changes: Change[], label = '') => {
    // Structural changes (insert/remove) carry no before/after value — keep them
    // unconditionally; value changes are dropped when they're a no-op.
    const effective = changes.filter((c) => c.kind === 'insert' || c.kind === 'remove' || c.before !== c.after)
    if (effective.length === 0) return
    for (const c of effective) applyChange(c, 'after')
    const entry: EditEntry = { changes: effective, label: label || effective[0].name || 'edit' }
    const next = [...entriesRef.current.slice(0, pointerRef.current + 1), entry] // drop redo tail
    entriesRef.current = next
    pointerRef.current = next.length - 1
    setEntries(next)
    setPointer(next.length - 1)
  }, [])

  const undo = useCallback(() => {
    const p = pointerRef.current
    if (p < 0) return
    const entry = entriesRef.current[p]
    for (const c of entry.changes) applyChange(c, 'before')
    pointerRef.current = p - 1
    setPointer(p - 1)
    bumpNav()
  }, [bumpNav])

  const redo = useCallback(() => {
    const p = pointerRef.current
    const next = entriesRef.current[p + 1]
    if (!next) return
    for (const c of next.changes) applyChange(c, 'after')
    pointerRef.current = p + 1
    setPointer(p + 1)
    bumpNav()
  }, [bumpNav])

  // Jump to an arbitrary point in the log: undo down to `target`, or redo up to
  // it. `target` is the desired pointer (−1 = before all edits, entries.length−1
  // = all applied). Same DOM ops as step-wise undo/redo, just batched.
  const goto = useCallback((target: number) => {
    let p = pointerRef.current
    const clamped = Math.max(-1, Math.min(target, entriesRef.current.length - 1))
    while (p > clamped) {
      const entry = entriesRef.current[p]
      for (const c of entry.changes) applyChange(c, 'before')
      p--
    }
    while (p < clamped) {
      const next = entriesRef.current[p + 1]
      if (!next) break
      for (const c of next.changes) applyChange(c, 'after')
      p++
    }
    pointerRef.current = p
    setPointer(p)
    bumpNav()
  }, [bumpNav])

  // Drop history, leave the DOM as-is (Save: edits persist, agent rewrites source).
  const clear = useCallback(() => {
    entriesRef.current = []
    pointerRef.current = -1
    setEntries([])
    setPointer(-1)
  }, [])

  // Revert the whole session (Cancel): first any in-flight (debounced) edit not
  // yet committed, then every applied entry newest → oldest. Doing pending first
  // means a property edited more than once unwinds in the right order (its
  // in-flight delta back to the committed value, then the committed value back
  // to the original). Then drop history.
  const discard = useCallback(() => {
    revertPendingSessions()
    const applied = entriesRef.current.slice(0, pointerRef.current + 1)
    for (let i = applied.length - 1; i >= 0; i--) {
      for (const c of applied[i].changes) applyChange(c, 'before')
    }
    setEntries([])
    setPointer(-1)
    bumpNav()
  }, [bumpNav])

  // Bridge the tracker into the change-reporter shim so the ported design pane
  // (applyPatch → reportPatch pre-hook) and drag gestures (commitChangeBatch)
  // record through us while edit mode is mounted.
  useEffect(() => {
    setReporterCommit(commit)
    return () => setReporterCommit(null)
  }, [commit])

  const value = useMemo<EditHistory>(
    () => ({
      applyLive,
      commit,
      undo,
      redo,
      goto,
      canUndo: pointer >= 0,
      canRedo: pointer < entries.length - 1,
      entries,
      pointer,
      navRevision,
      batch: entries.slice(0, pointer + 1),
      clear,
      discard,
    }),
    [applyLive, commit, undo, redo, goto, clear, discard, pointer, entries, navRevision],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEditHistory(): EditHistory {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEditHistory must be used within an EditHistoryProvider')
  return v
}
