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
import { setReporterCommit } from './change-reporter'

export interface Change {
  target: HTMLElement
  /** What surface the value lives on. `move` reorders the element within its
   *  parent — `before`/`after` are DOM child indices (see reposition-drag's
   *  `pixel-move-node`). */
  kind: 'style' | 'text' | 'attr' | 'move'
  /** style property (e.g. `padding-left`), attribute name, or '' for text/move. */
  name: string
  before: string
  after: string
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
  canUndo: boolean
  canRedo: boolean
  /** The applied entries (start → pointer), in order — the batch for Save. */
  batch: EditEntry[]
}

function applyValue(target: HTMLElement, kind: Change['kind'], name: string, value: string): void {
  if (kind === 'style') {
    if (value === '') target.style.removeProperty(name)
    else target.style.setProperty(name, value)
  } else if (kind === 'text') {
    target.textContent = value
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
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const pointerRef = useRef(pointer)
  pointerRef.current = pointer

  const applyLive = useCallback(
    (target: HTMLElement, kind: Change['kind'], name: string, value: string) =>
      applyValue(target, kind, name, value),
    [],
  )

  const commit = useCallback((changes: Change[], label = '') => {
    const effective = changes.filter((c) => c.before !== c.after)
    if (effective.length === 0) return
    for (const c of effective) applyValue(c.target, c.kind, c.name, c.after)
    setEntries((prev) => {
      const kept = prev.slice(0, pointerRef.current + 1) // drop redo tail
      return [...kept, { changes: effective, label: label || effective[0].name || 'edit' }]
    })
    setPointer((p) => p + 1)
  }, [])

  const undo = useCallback(() => {
    const p = pointerRef.current
    if (p < 0) return
    const entry = entriesRef.current[p]
    for (const c of entry.changes) applyValue(c.target, c.kind, c.name, c.before)
    setPointer(p - 1)
  }, [])

  const redo = useCallback(() => {
    const p = pointerRef.current
    const next = entriesRef.current[p + 1]
    if (!next) return
    for (const c of next.changes) applyValue(c.target, c.kind, c.name, c.after)
    setPointer(p + 1)
  }, [])

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
      canUndo: pointer >= 0,
      canRedo: pointer < entries.length - 1,
      batch: entries.slice(0, pointer + 1),
    }),
    [applyLive, commit, undo, redo, pointer, entries],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useEditHistory(): EditHistory {
  const v = useContext(Ctx)
  if (!v) throw new Error('useEditHistory must be used within an EditHistoryProvider')
  return v
}
