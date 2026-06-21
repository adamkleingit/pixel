import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScreenshareContext } from './context'
import { Blip } from './draw/blip'
import { DragRect, RectFlashView } from './draw/rect'
import { DrawStroke } from './draw/stroke'

export interface OverlayProps {
  /** Extra class applied to the overlay root. */
  className?: string
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const ICONS = {
  record: 'M12 7a5 5 0 100 10 5 5 0 000-10z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  resume: 'M7 5l12 7-12 7z',
  stop: 'M6 6h12v12H6z',
  cancel: 'M6 6l12 12M18 6L6 18',
  minimize: 'M6 12h12',
  expand: 'M12 6v12M6 12h12',
  mouse: 'M5 2 L5 19 L9.5 14.5 L12.5 20 L14.5 19 L11.5 13.5 L18 13 Z',
  edit: 'M17 3a2.83 2.83 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z',
}

const VERTICAL_POSITIONS = new Set(['center-left', 'center-right'])

/**
 * Keeps bar-originated events from reaching the host page's document-level
 * listeners, which dialogs/popovers use for click-outside & Esc dismissal.
 *
 * Native (not React) listeners in the BUBBLE phase: the button's own onClick
 * has already run (target phase fires first), so buttons keep working — the
 * event just never bubbles on to `document`.
 *
 * We intentionally do NOT stop `click`: the buttons fire on React's synthetic
 * onClick, and React may delegate `click` at `document` (React 16) or the root
 * container (17+). Stopping native `click` here could break the buttons in some
 * host React versions. Outside-click libraries key off pointer/mouse-down
 * anyway. Capture-phase host listeners (rare) fire before the event reaches the
 * bar and can't be contained here — use the library's own escape hatch for those.
 */
function useContainEvents<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const stop = (e: Event) => e.stopPropagation()
    const stopEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.stopPropagation()
    }
    const pointer = ['pointerdown', 'mousedown', 'pointerup', 'mouseup'] as const
    for (const t of pointer) node.addEventListener(t, stop)
    node.addEventListener('keydown', stopEscape)
    node.addEventListener('keyup', stopEscape)
    return () => {
      for (const t of pointer) node.removeEventListener(t, stop)
      node.removeEventListener('keydown', stopEscape)
      node.removeEventListener('keyup', stopEscape)
    }
  }, [])
  return ref
}

function IconButton({
  icon,
  label,
  onClick,
  stroke,
  tint,
}: {
  icon: keyof typeof ICONS
  label: string
  onClick: () => void
  stroke?: boolean
  tint?: string
}) {
  return (
    <button
      type="button"
      className="screenshare-rec-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={tint ? { color: tint } : undefined}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path
          d={ICONS[icon]}
          fill={stroke ? 'none' : 'currentColor'}
          stroke={stroke ? 'currentColor' : 'none'}
          strokeWidth={stroke ? 2.2 : 0}
          strokeLinecap="round"
        />
      </svg>
    </button>
  )
}

/**
 * Mouse-tool toggle — a cursor glyph; active (the default) means the mouse tool
 * is on: the page is inert and you can draw rectangles. Off = no tool, clicks
 * pass through to the page. Also bound to the `M` key while recording.
 */
function MouseToolToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`screenshare-rec-btn screenshare-rec-tool${on ? ' active' : ''}`}
      title={
        on
          ? 'Mouse tool ON — draw rectangles, page inert (M)'
          : 'Mouse tool OFF — clicks pass through to the page (M)'
      }
      aria-label="Mouse tool"
      aria-pressed={on}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path d={ICONS.mouse} fill="currentColor" />
      </svg>
    </button>
  )
}

/**
 * Edit-mode toggle — the pencil. Active (the default-off) means edit mode is on.
 * Composes with recording: you can edit and record at once (§4.3). Also bound to
 * double-tap Enter (enter) / Esc (exit).
 */
function EditToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`screenshare-rec-btn${on ? ' active' : ''}`}
      title={on ? 'Exit edit mode (Esc)' : 'Edit (double-tap Enter)'}
      aria-label="Edit"
      aria-pressed={on}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path
          d={ICONS.edit}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

/** The floating control bar — clickable (pointer-events:auto) over the page. */
function RecBar() {
  const { state, start, pause, resume, stop, cancel, editing, toggleEdit, passthrough, setPassthrough, bar } =
    useScreenshareContext()
  const recording = state === 'recording'
  const idle = state === 'idle'
  const [minimized, setMinimized] = useState(false)
  const containRef = useContainEvents<HTMLDivElement>()

  // Elapsed timer that only advances while actively recording.
  const [elapsed, setElapsed] = useState(0)
  const accRef = useRef(0)
  const lastTickRef = useRef(performance.now())
  useEffect(() => {
    if (idle) {
      accRef.current = 0
      setElapsed(0)
    }
    lastTickRef.current = performance.now()
    const timer = window.setInterval(() => {
      const now = performance.now()
      if (recording) accRef.current += now - lastTickRef.current
      lastTickRef.current = now
      setElapsed(accRef.current)
    }, 250)
    return () => window.clearInterval(timer)
  }, [recording, idle])

  const vertical = VERTICAL_POSITIONS.has(bar.position)
  const cls =
    `screenshare-rec pos-${bar.position}` +
    (vertical ? ' vertical' : '') +
    (idle ? ' idle' : recording ? '' : ' paused') +
    (editing ? ' editing' : '') +
    (minimized ? ' minimized' : '')

  if (minimized) {
    return (
      <div ref={containRef} className={cls} style={{ opacity: bar.opacity }}>
        {!idle && <span className="screenshare-rec-dot" />}
        <IconButton icon="expand" label="Expand" onClick={() => setMinimized(false)} stroke />
      </div>
    )
  }

  return (
    <div ref={containRef} className={cls} style={{ opacity: bar.opacity }}>
      {idle ? (
        <button
          type="button"
          className="screenshare-rec-record"
          title="Start recording (double-tap Space)"
          onClick={() => start()}
        >
          <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
            <path d={ICONS.record} fill="#ef4444" />
          </svg>
          Rec
        </button>
      ) : (
        <>
          <span className="screenshare-rec-dot" />
          <span className="screenshare-rec-time">
            {recording ? 'REC' : 'PAUSED'} {formatElapsed(elapsed)}
          </span>
        </>
      )}

      <span className="screenshare-rec-sep" />
      <EditToggle on={editing} onToggle={toggleEdit} />
      <MouseToolToggle on={!passthrough} onToggle={() => setPassthrough(!passthrough)} />

      {!idle && (
        <>
          <span className="screenshare-rec-sep" />
          {recording ? (
            <IconButton icon="pause" label="Pause (Space)" onClick={pause} />
          ) : (
            <IconButton icon="resume" label="Resume (Space)" onClick={resume} />
          )}
          <IconButton icon="stop" label="Stop (double-tap Space)" onClick={() => void stop()} />
          <IconButton icon="cancel" label="Cancel (Esc)" onClick={cancel} stroke />
        </>
      )}

      <span className="screenshare-rec-sep" />
      <IconButton icon="minimize" label="Minimize" onClick={() => setMinimized(true)} stroke />
    </div>
  )
}

/** Failure toast shown when a recording couldn't be sent — offers a resend. */
function SaveError() {
  const { saveError, saving, resend } = useScreenshareContext()
  if (!saveError) return null
  return (
    <div className="screenshare-save-error" role="alert">
      <span className="screenshare-save-error-msg">{saveError}</span>
      <button
        type="button"
        className="screenshare-save-error-btn"
        onClick={resend}
        disabled={saving}
      >
        {saving ? 'Resending…' : 'Resend'}
      </button>
    </div>
  )
}

/**
 * The single overlay surface mounted by the host. Renders the floating control
 * bar, click radar blips, and drag rectangles. Only the control bar receives
 * pointer events; the rest passes through so the page stays interactive.
 */
export function Overlay({ className }: OverlayProps) {
  const {
    state,
    blips,
    removeBlip,
    dragRect,
    rectFlashes,
    removeRectFlash,
    drawStroke,
    drawStrokes,
    bar,
    editing,
  } = useScreenshareContext()

  if (typeof document === 'undefined') return null

  const active = state === 'recording' || state === 'paused'

  return createPortal(
    <div className={className ? `screenshare-overlay ${className}` : 'screenshare-overlay'}>
      {(active || editing || bar.always) && <RecBar />}
      <SaveError />
      {rectFlashes.map((r) => (
        <RectFlashView key={r.id} flash={r} onDone={removeRectFlash} />
      ))}
      {dragRect && <DragRect rect={dragRect} />}
      {drawStrokes.map((s) => (
        <DrawStroke key={s.id} stroke={s} />
      ))}
      {drawStroke && <DrawStroke stroke={drawStroke} />}
      {blips.map((b) => (
        <Blip key={b.id} data={b} onDone={removeBlip} />
      ))}
    </div>,
    document.body,
  )
}
