import { useEffect, useRef, useState } from 'react'
import { usePixelContext } from './context'

/**
 * StatesPane — the right-docked state-history (time-travel) pane.
 *
 * Mirrors DesignPane's docking exactly (reserve layout width by shrinking
 * `<html>`; collapse; drag-resize the left edge) so it feels like the design
 * panel. Its body is the pixel-react frame timeline: every captured commit as a
 * timestamp row. Click a row — or the ‹ › chevrons — to freeze the app to that
 * state; "Resume live" (or closing the pane) returns to the live app.
 *
 * Frames only appear when the app routes its `react` through pixel-react (a
 * dev-only bundler alias — see the README). Without it the list stays empty and
 * the pane explains why.
 */

const PANE_W = 280
const COLLAPSED_W = 36
const MIN_W = 220
const MAX_W = 560

/** `HH:MM:SS.mmm` local time — millis included so rapid commits stay distinct. */
function formatStamp(at: number): string {
  const d = new Date(at)
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d={dir === 'left' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StatesPane() {
  const {
    stateFrames,
    frozenIndex,
    gotoState,
    stepStateBack,
    stepStateForward,
    cancelTimeTravel,
  } = usePixelContext()

  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(PANE_W)

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
      /* no active pointer (jsdom) — capture is best-effort */
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
  useEffect(() => {
    const html = document.documentElement
    const prevMargin = html.style.marginRight
    const prevTransition = html.style.transition
    html.style.transition = dragging.current ? 'none' : 'margin-right 160ms ease'
    html.style.marginRight = `${collapsed ? 0 : width}px`
    html.style.setProperty('--pixel-dock-right', `${collapsed ? COLLAPSED_W : width}px`)
    return () => {
      html.style.marginRight = prevMargin
      html.style.transition = prevTransition
      html.style.removeProperty('--pixel-dock-right')
    }
  }, [collapsed, width])

  const frozen = frozenIndex !== null
  const count = stateFrames.length

  return (
    <aside
      className={`pixel-pane${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { width }}
      aria-label="State history pane"
    >
      {!collapsed && (
        <div
          className="pixel-pane-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize state history pane"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      )}
      <div className="pixel-pane-head">
        {!collapsed && <span className="pixel-pane-title">States</span>}
        <button
          type="button"
          className="pixel-pane-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand state history pane' : 'Collapse state history pane'}
          aria-label={collapsed ? 'Expand state history pane' : 'Collapse state history pane'}
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

      {/* Step through captured states — a labeled Back/Next bar under the header
          (clearer than the bare chevrons that used to sit in the header row). */}
      {!collapsed && (
        <div className="pixel-states-nav">
          <button
            type="button"
            className="pixel-states-navbtn"
            title="Previous state"
            aria-label="Previous state"
            disabled={count === 0 || frozenIndex === 0}
            onClick={stepStateBack}
          >
            <Chevron dir="left" />
            Back
          </button>
          <button
            type="button"
            className="pixel-states-navbtn"
            title="Next state"
            aria-label="Next state"
            disabled={count === 0 || frozenIndex === count - 1}
            onClick={stepStateForward}
          >
            Next
            <Chevron dir="right" />
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="pixel-pane-body">
          {frozen && (
            <div className="pixel-states-frozen">
              <span className="pixel-states-frozen-dot" />
              Frozen at state {frozenIndex! + 1} of {count}
              <button
                type="button"
                className="pixel-states-resume"
                onClick={cancelTimeTravel}
                title="Resume the live app (back to passthrough)"
              >
                Resume live
              </button>
            </div>
          )}

          {count === 0 ? (
            <div className="pixel-pane-empty">
              No states captured yet. Interact with the app to record state changes.
              <br />
              <br />
              If nothing appears, make sure the app routes <code>react</code> through
              pixel-react (dev alias — see the README).
            </div>
          ) : (
            <ul className="pixel-states-list">
              {stateFrames.map((f, i) => (
                <li
                  key={f.id}
                  className={
                    'pixel-states-item' + (i === frozenIndex ? ' current' : '')
                  }
                >
                  <button
                    type="button"
                    className="pixel-states-row"
                    title={`Freeze to state ${i + 1}`}
                    onClick={() => gotoState(i)}
                  >
                    <span className="pixel-states-num">{i + 1}</span>
                    <span className="pixel-states-time">{formatStamp(f.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}
