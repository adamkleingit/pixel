import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useScreenshareContext } from './context'
import { Blip } from './draw/blip'
import { DragRect, RectFlashView } from './draw/rect'

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
}

const VERTICAL_POSITIONS = new Set(['center-left', 'center-right'])

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

/** Passthrough toggle — a transparency (checkerboard) glyph; selected = on. */
function PassToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`screenshare-rec-btn screenshare-rec-pass${on ? ' active' : ''}`}
      title={
        on
          ? 'Pass-through ON — clicks reach the page'
          : 'Pass-through OFF — page is inert (clicks blocked)'
      }
      aria-label="Pass clicks through to the page"
      aria-pressed={on}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3.5" y="3.5" width="8.5" height="8.5" fill="currentColor" />
        <rect x="12" y="12" width="8.5" height="8.5" fill="currentColor" />
      </svg>
    </button>
  )
}

/** The floating control bar — clickable (pointer-events:auto) over the page. */
function RecBar() {
  const { state, start, pause, resume, stop, cancel, passthrough, setPassthrough, bar } =
    useScreenshareContext()
  const recording = state === 'recording'
  const idle = state === 'idle'
  const [minimized, setMinimized] = useState(false)

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
    (minimized ? ' minimized' : '')

  if (minimized) {
    return (
      <div className={cls} style={{ opacity: bar.opacity }}>
        {!idle && <span className="screenshare-rec-dot" />}
        <IconButton icon="expand" label="Expand" onClick={() => setMinimized(false)} stroke />
      </div>
    )
  }

  return (
    <div className={cls} style={{ opacity: bar.opacity }}>
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
      <PassToggle on={passthrough} onToggle={() => setPassthrough(!passthrough)} />

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
  const { state, blips, removeBlip, dragRect, rectFlashes, removeRectFlash, bar } =
    useScreenshareContext()

  if (typeof document === 'undefined') return null

  const active = state === 'recording' || state === 'paused'

  return createPortal(
    <div className={className ? `screenshare-overlay ${className}` : 'screenshare-overlay'}>
      {(active || bar.always) && <RecBar />}
      <SaveError />
      {rectFlashes.map((r) => (
        <RectFlashView key={r.id} flash={r} onDone={removeRectFlash} />
      ))}
      {dragRect && <DragRect rect={dragRect} />}
      {blips.map((b) => (
        <Blip key={b.id} data={b} onDone={removeBlip} />
      ))}
    </div>,
    document.body,
  )
}
