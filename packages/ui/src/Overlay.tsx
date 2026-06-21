import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useScreenshareContext } from './context'
import { Blip } from './draw/blip'
import { DragRect, RectFlashView } from './draw/rect'
import { DrawStroke } from './draw/stroke'
import type { BarPosition, Task, TaskStatus } from './types'

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

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'Pending',
  executing: 'Executing',
  done: 'Done',
  error: 'Error',
}

/** A recording is "active" (worth a badge count) while pending or executing. */
function isActive(t: Task): boolean {
  return t.status === 'pending' || t.status === 'executing'
}

/** Epoch ms parsed from an id like `20260621-151254-644-rand`, or null. */
function parseIdTime(id: string): number | null {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/)
  if (!m) return null
  const [, y, mo, d, h, mi, s] = m
  return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime()
}

/** Human timestamp like `7.12.26 10:15:02` (D.M.YY HH:MM:SS, local time). */
function formatStamp(t: Task): string {
  const ms = t.createdAt ?? parseIdTime(t.id)
  if (ms == null) return t.id
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `${d.getDate()}.${d.getMonth() + 1}.${yy} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Place the popup just outside the bar, on whichever side the bar is docked. */
function panelAnchor(position: BarPosition): CSSProperties {
  const gap = 10
  if (position.includes('right')) return { right: `calc(100% + ${gap}px)`, top: 0 }
  if (position.includes('left')) return { left: `calc(100% + ${gap}px)`, top: 0 }
  if (position.startsWith('top')) return { top: `calc(100% + ${gap}px)`, right: 0 }
  return { bottom: `calc(100% + ${gap}px)`, right: 0 }
}

/** The bar button that surfaces task status — a count badge, or an error sign. */
function TaskIndicator({
  activeCount,
  serverDown,
  open,
  onClick,
}: {
  activeCount: number
  serverDown: boolean
  open: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={
        'screenshare-rec-btn screenshare-rec-tasks' +
        (serverDown ? ' error' : '') +
        (open ? ' active' : '')
      }
      title={serverDown ? 'Pixel server unreachable — click for details' : 'Recording tasks'}
      aria-label={serverDown ? 'Pixel server unreachable' : 'Recording tasks'}
      onClick={onClick}
    >
      {serverDown ? (
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path
            d="M12 4 L21.5 20 L2.5 20 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M12 10v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="12" cy="17" r="1" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path
            d="M9 6h11M9 12h11M9 18h11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="4.5" cy="6" r="1.3" fill="currentColor" />
          <circle cx="4.5" cy="12" r="1.3" fill="currentColor" />
          <circle cx="4.5" cy="18" r="1.3" fill="currentColor" />
        </svg>
      )}
      {!serverDown && activeCount > 0 && (
        <span className="screenshare-rec-badge">{activeCount}</span>
      )}
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

/** Popup listing the recordings the server is tracking and their status. */
function TasksPanel({
  tasks,
  anchor,
  onOpen,
}: {
  tasks: Task[]
  anchor: CSSProperties
  onOpen: (id: string) => void
}) {
  return (
    <div className="screenshare-tasks" style={anchor} role="dialog" aria-label="Recording tasks">
      <div className="screenshare-tasks-head">Recordings</div>
      {tasks.length === 0 ? (
        <div className="screenshare-tasks-empty">No recordings yet.</div>
      ) : (
        <ul className="screenshare-tasks-list">
          {tasks.map((t) => (
            <li key={t.id} className="screenshare-tasks-item">
              <button
                type="button"
                className="screenshare-tasks-open"
                title={`Open folder — ${t.id}`}
                onClick={() => onOpen(t.id)}
              >
                <span className="screenshare-tasks-id">{formatStamp(t)}</span>
                <span className={`screenshare-tasks-pill ${t.status}`}>{STATUS_LABEL[t.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The floating control bar — clickable (pointer-events:auto) over the page. */
function RecBar() {
  const {
    state,
    start,
    pause,
    resume,
    stop,
    cancel,
    editing,
    toggleEdit,
    passthrough,
    setPassthrough,
    bar,
    tasks,
    serverDown,
    openTask,
  } = useScreenshareContext()
  const recording = state === 'recording'
  const idle = state === 'idle'
  const [minimized, setMinimized] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const containRef = useContainEvents<HTMLDivElement>()

  const activeCount = tasks.filter(isActive).length
  // The indicator earns a slot whenever there's something to show — active
  // tasks, a server error, or a popup the user has opened.
  const showIndicator = serverDown || tasks.length > 0 || panelOpen
  const indicator = showIndicator && (
    <TaskIndicator
      activeCount={activeCount}
      serverDown={serverDown}
      open={panelOpen}
      onClick={() => setPanelOpen((o) => !o)}
    />
  )
  // The popup follows the live server state: the tasks list while connected, the
  // reused error toast (rendered by the caller) while the server is unreachable.
  const tasksPopup = panelOpen && !serverDown && (
    <TasksPanel tasks={tasks} anchor={panelAnchor(bar.position)} onOpen={openTask} />
  )
  const serverDownToast = panelOpen && serverDown && (
    <ErrorToast
      message={
        <>
          The Pixel server isn’t responding. Type <strong>pixel</strong> to your agent to start it —
          the bar reconnects automatically.
        </>
      }
      actionLabel="Dismiss"
      onAction={() => setPanelOpen(false)}
    />
  )

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
      <>
        <div ref={containRef} className={cls} style={{ opacity: bar.opacity }}>
          {!idle && <span className="screenshare-rec-dot" />}
          {indicator}
          <IconButton icon="expand" label="Expand" onClick={() => setMinimized(false)} stroke />
          {tasksPopup}
        </div>
        {serverDownToast}
      </>
    )
  }

  return (
    <>
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

      {showIndicator && (
        <>
          <span className="screenshare-rec-sep" />
          {indicator}
        </>
      )}

      <span className="screenshare-rec-sep" />
      <IconButton icon="minimize" label="Minimize" onClick={() => setMinimized(true)} stroke />
      {tasksPopup}
    </div>
    {serverDownToast}
    </>
  )
}

/** A bottom-center alert toast with a single action button. */
function ErrorToast({
  message,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  message: ReactNode
  actionLabel: string
  onAction: () => void
  actionDisabled?: boolean
}) {
  return (
    <div className="screenshare-save-error" role="alert">
      <span className="screenshare-save-error-msg">{message}</span>
      <button
        type="button"
        className="screenshare-save-error-btn"
        onClick={onAction}
        disabled={actionDisabled}
      >
        {actionLabel}
      </button>
    </div>
  )
}

/** Failure toast shown when a recording couldn't be sent — offers a resend. */
function SaveError() {
  const { saveError, saving, resend } = useScreenshareContext()
  if (!saveError) return null
  return (
    <ErrorToast
      message={saveError}
      actionLabel={saving ? 'Resending…' : 'Resend'}
      onAction={resend}
      actionDisabled={saving}
    />
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
    tasks,
    serverDown,
    editing,
  } = useScreenshareContext()

  if (typeof document === 'undefined') return null

  const active = state === 'recording' || state === 'paused'
  // Surface the bar (and its indicator) whenever there's status worth showing,
  // even while idle: active recordings on the server, or a connection error.
  const showBar = active || bar.always || serverDown || tasks.length > 0 || editing

  return createPortal(
    <div className={className ? `screenshare-overlay ${className}` : 'screenshare-overlay'}>
      {showBar && <RecBar />}
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
