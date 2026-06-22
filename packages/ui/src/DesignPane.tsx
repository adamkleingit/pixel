import { useEffect, useState } from 'react'
import { useSelectionStore } from './selection/selection-store'

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

/** Curated computed-style readout for the selected element. */
function readStyles(el: Element): Array<[string, string]> {
  const cs = getComputedStyle(el)
  const r = el.getBoundingClientRect()
  return [
    ['size', `${Math.round(r.width)} × ${Math.round(r.height)}`],
    ['display', cs.display],
    ['color', cs.color],
    ['background', cs.backgroundColor],
    ['font', `${cs.fontSize} / ${cs.fontWeight}`],
    ['padding', cs.padding],
    ['margin', cs.margin],
    ['radius', cs.borderRadius],
  ]
}

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
  const [collapsed, setCollapsed] = useState(false)
  const [tag, setTag] = useState('')
  const [rows, setRows] = useState<Array<[string, string]>>([])

  // Reserve layout width by shrinking <html>; restore on collapse / unmount.
  // The CSS var lets the floating bar dodge the pane (see styles `pos-*-right`).
  useEffect(() => {
    const html = document.documentElement
    const prevMargin = html.style.marginRight
    const prevTransition = html.style.transition
    html.style.transition = 'margin-right 160ms ease'
    html.style.marginRight = `${collapsed ? 0 : PANE_W}px`
    html.style.setProperty('--screenshare-dock-right', `${collapsed ? COLLAPSED_W : PANE_W}px`)
    return () => {
      html.style.marginRight = prevMargin
      html.style.transition = prevTransition
      html.style.removeProperty('--screenshare-dock-right')
    }
  }, [collapsed])

  useEffect(() => {
    if (!anchor) {
      setTag('')
      setRows([])
      return
    }
    setTag(describe(anchor))
    setRows(readStyles(anchor))
  }, [anchor])

  return (
    <aside className={`screenshare-pane${collapsed ? ' collapsed' : ''}`} aria-label="Design pane">
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
          {anchor ? (
            <>
              <div className="screenshare-pane-tag">{tag}</div>
              {rows.map(([k, v]) => (
                <div className="screenshare-pane-row" key={k}>
                  <span className="screenshare-pane-key">{k}</span>
                  <span className="screenshare-pane-val">{v}</span>
                </div>
              ))}
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
