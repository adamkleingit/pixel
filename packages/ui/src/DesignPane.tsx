import { useEffect, useRef, useState } from 'react'
import { useSelectionStore } from './selection/selection-store'
import { useEditHistory } from './edit/edit-history'
import { DesignPanel } from './properties-sidebar/DesignPanel'
import { TokensProvider } from './tokens-context'

/**
 * DesignPane — the right-docked inspector shown in edit mode. Unlike the
 * floating bar, it **reserves layout width**: while expanded it shrinks the
 * document (a `margin-right` on `<html>`) so the app reflows beside it rather
 * than being covered. Collapsing (like the recording bar's minimize) frees the
 * width and leaves a thin strip; on exit the original margin is restored.
 *
 * v1 is a read-only inspector of the selected element (tag + a few live
 * computed styles), driven by the shared SelectionProvider. The real editable
 * Design sections (Appearance / Layout / Typography) + the change-reporter sink
 * are a later capability port. A future canvas phase will replace the
 * margin-shrink with a proper resizable frame (zoom + device sizes).
 */

const PANE_W = 280
const COLLAPSED_W = 36
const MIN_W = 220
const MAX_W = 560

/** `<tag.class>` / `<tag#id>` label for the selected element. */
function describe(el: Element): string {
  const tag = el.tagName.toLowerCase()
  if (el.id) return `<${tag}#${el.id}>`
  const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)[0]
  return cls ? `<${tag}.${cls}>` : `<${tag}>`
}

export function DesignPane() {
  const { entries } = useSelectionStore()
  const anchor = entries[0]?.element ?? null
  const el = anchor instanceof HTMLElement ? anchor : null
  // The full selection (anchor + match entries) — sections collapse disagreeing
  // values to "Multiple" when more than one element is passed.
  const els = entries.map((e) => e.element)
  const history = useEditHistory()
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(PANE_W)
  const [tag, setTag] = useState('')

  // Resize by dragging the pane's left edge (like Pixel's right sidebar).
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, w: PANE_W })

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = { x: e.clientX, w: width }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no active pointer (e.g. jsdom) — capture is best-effort */
    }
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const next = dragStart.current.w - (e.clientX - dragStart.current.x) // drag left → wider
    setWidth(Math.min(MAX_W, Math.max(MIN_W, next)))
  }
  function onResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  // Reserve layout width by shrinking <html>; restore on collapse / unmount.
  // The CSS var lets the floating bar dodge the pane (see styles `pos-*-right`).
  // No transition while dragging (the resize should track the pointer 1:1).
  useEffect(() => {
    const html = document.documentElement
    const prevMargin = html.style.marginRight
    const prevTransition = html.style.transition
    html.style.transition = dragging.current ? 'none' : 'margin-right 160ms ease'
    html.style.marginRight = `${collapsed ? 0 : width}px`
    html.style.setProperty('--screenshare-dock-right', `${collapsed ? COLLAPSED_W : width}px`)
    return () => {
      html.style.marginRight = prevMargin
      html.style.transition = prevTransition
      html.style.removeProperty('--screenshare-dock-right')
    }
  }, [collapsed, width])

  useEffect(() => {
    setTag(anchor ? describe(anchor) : '')
  }, [anchor])

  // Undo / redo (Cmd/Ctrl+Z, +Shift to redo) — ignored while typing in a field
  // or inline-editing, so it doesn't fight the native text undo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      const ae = document.activeElement as HTMLElement | null
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
      e.preventDefault()
      if (e.shiftKey) history.redo()
      else history.undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [history.undo, history.redo])

  return (
    <aside
      className={`screenshare-pane${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { width }}
      aria-label="Design pane"
    >
      {!collapsed && (
        <div
          className="screenshare-pane-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize design pane"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      )}
      <div className="screenshare-pane-head">
        {!collapsed && <span className="screenshare-pane-title">Design</span>}
        <button
          type="button"
          className="screenshare-pane-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand design pane' : 'Collapse design pane'}
          aria-label={collapsed ? 'Expand design pane' : 'Collapse design pane'}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d={collapsed ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="screenshare-pane-body">
          {el ? (
            <>
              <div className="screenshare-pane-tag">{tag}</div>
              <TokensProvider>
                <DesignPanel
                  selectedTag={el.tagName.toLowerCase()}
                  headerTag={el.tagName.toLowerCase()}
                  selectedElement={el}
                  elements={els.length ? els : [el]}
                />
              </TokensProvider>
            </>
          ) : (
            <div className="screenshare-pane-empty">
              Select an element on the page to inspect it.
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
