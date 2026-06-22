/**
 * SelectionStore — the single source of truth for what's selected and hovered.
 * Ported from Pixel's canvas selection store (kept deliberately close to the
 * original so the rest of the selection model ports cleanly). In the in-app
 * model there's one surface, so callers pass a constant tileId; the multi-tile
 * shape is retained verbatim for when the canvas (multiple frames) returns.
 *
 * The selection is an ordered SET of `{ tileId, element }`. `entries[0]` is the
 * anchor — the "primary" element the Design pane / Elements panel key on, and
 * the one that renders the solid selection outline (the rest render as match
 * outlines). Hover is a single `{ tileId, element }`.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export interface SelEntry {
  tileId: string
  element: Element
}

export interface SelectionStore {
  /** Ordered selection set. `entries[0]` is the anchor. Empty = nothing selected. */
  entries: SelEntry[]
  /** Current hover, or null. */
  hover: SelEntry | null

  /** Replace the whole set with a single element (plain click). `null` clears. */
  pick: (tileId: string, element: Element | null) => void
  /** Add the element if absent, remove it if present (Shift+click). Keeps the
   *  anchor stable when adding; promotes the next member when the anchor is
   *  removed. */
  toggle: (tileId: string, element: Element) => void
  /** Replace the set with exactly these elements, in order. */
  selectMany: (tileId: string, elements: readonly Element[]) => void
  /** Set / clear hover. */
  setHover: (tileId: string, element: Element | null) => void
  /** Drop every entry (and hover) belonging to a tile. */
  clearTile: (tileId: string) => void
  /** Replace exactly this tile's entries (other tiles untouched). Preserves
   *  anchor position when the anchor belonged to this tile. */
  setTileEntries: (tileId: string, elements: readonly Element[]) => void
  /** Clear everything (Escape / click-outside everywhere). */
  clearAll: () => void
}

const Ctx = createContext<SelectionStore | null>(null)

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<SelEntry[]>([])
  const [hover, setHoverState] = useState<SelEntry | null>(null)

  const pick = useCallback((tileId: string, element: Element | null) => {
    setEntries(element ? [{ tileId, element }] : [])
  }, [])

  const toggle = useCallback((tileId: string, element: Element) => {
    setEntries(prev => {
      const i = prev.findIndex(e => e.element === element)
      if (i >= 0) return prev.filter((_, j) => j !== i) // remove (promotes entries[0] naturally)
      return [...prev, { tileId, element }]
    })
  }, [])

  const selectMany = useCallback((tileId: string, elements: readonly Element[]) => {
    setEntries(elements.map(element => ({ tileId, element })))
  }, [])

  const setHover = useCallback((tileId: string, element: Element | null) => {
    setHoverState(element ? { tileId, element } : null)
  }, [])

  const clearTile = useCallback((tileId: string) => {
    setEntries(prev => (prev.some(e => e.tileId === tileId) ? prev.filter(e => e.tileId !== tileId) : prev))
    setHoverState(prev => (prev && prev.tileId === tileId ? null : prev))
  }, [])

  const clearAll = useCallback(() => {
    setEntries(prev => (prev.length ? [] : prev))
    setHoverState(prev => (prev ? null : prev))
  }, [])

  const setTileEntries = useCallback((tileId: string, elements: readonly Element[]) => {
    setEntries(prev => {
      const others = prev.filter(e => e.tileId !== tileId)
      const mine = elements.map(element => ({ tileId, element }))
      // Keep the anchor in front if it belonged to this tile.
      return prev[0]?.tileId === tileId ? [...mine, ...others] : [...others, ...mine]
    })
  }, [])

  const value = useMemo<SelectionStore>(
    () => ({ entries, hover, pick, toggle, selectMany, setHover, clearTile, setTileEntries, clearAll }),
    [entries, hover, pick, toggle, selectMany, setHover, clearTile, setTileEntries, clearAll],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSelectionStore(): SelectionStore {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSelectionStore must be used within a SelectionProvider')
  return v
}

// ---------------------------------------------------------------------------
// Derived selectors (pure helpers over a store snapshot)
// ---------------------------------------------------------------------------

/** The anchor element (primary) — `entries[0]`, or null. */
export function anchorOf(store: SelectionStore): SelEntry | null {
  return store.entries[0] ?? null
}

/** Every selected element, in order (anchor first). */
export function selectedElementsOf(store: SelectionStore): Element[] {
  return store.entries.map(e => e.element)
}
