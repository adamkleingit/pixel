import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { usePixelContext } from './context'
import { Blip } from './draw/blip'
import { DragRect, RectFlashView } from './draw/rect'
import { DrawStroke } from './draw/stroke'
import { DesignPane } from './DesignPane'
import { ElementsPane } from './ElementsPane'
import { StatesPane } from './StatesPane'
import { Selection } from './Selection'
import { SelectionProvider } from './selection/selection-store'
import { EditHistoryProvider, useEditHistory, type EditEntry } from './edit/edit-history'
import { setEditActionHandlers } from './edit/edit-actions'
import { drainPendingChanges } from './edit/change-reporter'
import { buildEditPayload } from './edit/edit-payload'
import { TokensProvider } from './tokens-context'
import { Onboarding } from './onboarding/Onboarding'
import { useContainEvents } from './useContainEvents'
import { startBugRecording, uploadBugReport, type BugRecording } from './bug-report'
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
  // Microphone — a screen recording (voice + clicks).
  mic: 'M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zM6 11a6 6 0 0 0 12 0M12 17v4',
  // Floppy-disk "save": outer body + 5px corner, the label slot, the slider.
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  // History clock (edit log): a counter-clockwise arc with a clock hand.
  editLog: 'M3.5 9 A 8 8 0 1 0 6.2 4.2 M3.5 4.5 V9 H8 M12 8.5 V12.5 L15 14.3',
  // Time-travel (state history): a rewind clock — counter-clockwise arc + hand.
  timeTravel: 'M3.5 9 A 8 8 0 1 0 6.2 4.2 M3.5 4.5 V9 H8 M12 8 V12.5 L15.5 14.5',
  // Chevrons for stepping between states.
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  // Undo / redo: arrowhead + a curved arc back the other way.
  undo: 'M9 6 L4 11 L9 16 M4 11 H13 A5 5 0 1 1 13 21 H9',
  redo: 'M15 6 L20 11 L15 16 M20 11 H11 A5 5 0 1 0 11 21 H15',
  // Bug (Lucide "bug"): body + legs + antennae.
  bug: 'm8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4',
  check: 'M5 12l5 5L20 7',
}

const VERTICAL_POSITIONS = new Set(['center-left', 'center-right'])

function IconButton({
  icon,
  label,
  onClick,
  stroke,
  tint,
  tour,
}: {
  icon: keyof typeof ICONS
  label: string
  onClick: () => void
  stroke?: boolean
  tint?: string
  /** `data-pixel-tour` anchor so onboarding callouts can point at this button. */
  tour?: string
}) {
  return (
    <button
      type="button"
      className="pixel-rec-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={tint ? { color: tint } : undefined}
      data-pixel-tour={tour}
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
 * is on: the page is inert and Pixel owns pointer input. Off = clicks pass
 * through to the real app. Also bound to the `M` key. The tooltip is
 * mode-specific (recording draws rectangles; edit mode selects & edits).
 */
function MouseToolToggle({
  on,
  onToggle,
  titleOn = 'Mouse tool ON — draw rectangles, page inert (M)',
  titleOff = 'Mouse tool OFF — clicks pass through to the page (M)',
  tour,
}: {
  on: boolean
  onToggle: () => void
  titleOn?: string
  titleOff?: string
  /** `data-pixel-tour` anchor for onboarding callouts. */
  tour?: string
}) {
  return (
    <button
      type="button"
      className={`pixel-rec-btn pixel-rec-tool${on ? ' active' : ''}`}
      title={on ? titleOn : titleOff}
      aria-label="Mouse tool"
      aria-pressed={on}
      onClick={onToggle}
      data-pixel-tour={tour}
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
        'pixel-rec-btn pixel-rec-tasks' +
        (serverDown ? ' error' : '') +
        (open ? ' active' : '')
      }
      title={serverDown ? 'Pixel server unreachable — click for details' : 'Task log'}
      aria-label={serverDown ? 'Pixel server unreachable' : 'Task log'}
      onClick={onClick}
      data-pixel-tour="changelog"
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
        <span className="pixel-rec-badge">{activeCount}</span>
      )}
    </button>
  )
}

/**
 * Edit-mode toggle — the pencil. Active (the default-off) means edit mode is on.
 * Composes with recording: you can edit and record at once (§4.3). Also bound to
 * double-tap Enter (enter) / Esc (exit).
 */
/** One-line summary of a history entry for the edit-log list. */
function summarizeEntry(entry: EditEntry): string {
  const c = entry.changes[0]
  if (!c) return entry.label || 'edit'
  const label = entry.label || c.name || c.kind
  if (entry.changes.length > 1) return `${label} · ${entry.changes.length} changes`
  const short = (s: string) => (s.length > 16 ? `${s.slice(0, 15)}…` : s)
  if (c.kind === 'text') return `text: “${short(c.after)}”`
  if (c.kind === 'move') return 'reorder'
  return `${label}: ${short(c.after || '—')}`
}

/**
 * Edit-log button + popup: a history clock icon (shown only while editing) that
 * opens a list of every change in the current session — applied ones highlighted,
 * undone (redoable) ones dimmed — with undo/redo controls in the header. Clicking
 * a row jumps the history pointer there (`goto`). Rendered inside the bar so it's
 * event-contained; the popup anchors to the bar via `panelAnchor` (a static
 * wrapper keeps the bar as the positioning context).
 */
function EditLog() {
  const { entries, pointer, undo, redo, goto, canUndo, canRedo } = useEditHistory()
  const { bar } = usePixelContext()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)

  // Close on a click outside the log (bar containment means in-bar clicks don't
  // reach `window`, so this only fires for page/pane clicks).
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const navBtn = (icon: keyof typeof ICONS, label: string, onClick: () => void, disabled: boolean) => (
    <button
      type="button"
      className="pixel-editlog-nav-btn"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d={ICONS[icon]} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )

  return (
    <span ref={rootRef} style={{ display: 'inline-flex' }}>
      <button
        type="button"
        className={`pixel-rec-btn${open ? ' active' : ''}`}
        title="Change history"
        aria-label="Change history"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-pixel-tour="history"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path d={ICONS.editLog} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="pixel-editlog" style={panelAnchor(bar.position)} role="dialog" aria-label="Change history">
          <div className="pixel-editlog-head">
            <span>Changes</span>
            <span className="pixel-editlog-nav">
              {navBtn('undo', 'Undo (⌘Z)', undo, !canUndo)}
              {navBtn('redo', 'Redo (⇧⌘Z)', redo, !canRedo)}
            </span>
          </div>
          {entries.length === 0 ? (
            <div className="pixel-editlog-empty">No changes yet.</div>
          ) : (
            <ul className="pixel-editlog-list">
              {entries.map((entry, i) => (
                <li
                  key={i}
                  className={
                    'pixel-editlog-item' +
                    (i > pointer ? ' undone' : '') +
                    (i === pointer ? ' current' : '')
                  }
                >
                  <button
                    type="button"
                    className="pixel-editlog-row"
                    title={i > pointer ? 'Redo to here' : 'Undo to here'}
                    onClick={() => goto(i)}
                  >
                    <span className="pixel-editlog-num">{i + 1}</span>
                    <span className="pixel-editlog-label">{summarizeEntry(entry)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  )
}

/**
 * Edit-mode bar controls: Save (diskette) + Cancel (X). Save persists the change
 * batch through the sink (→ dropbox → the agent picks it up like a recording)
 * and exits, leaving the edits applied; Cancel reverts every change and exits.
 * Both are also bound to keys — double-Enter (Save) / Esc (Cancel) — via the
 * edit-actions bridge registered here, so the shortcuts and the buttons run the
 * exact same logic. Lives inside EditHistoryProvider so it can read the batch.
 */
function EditControls() {
  const history = useEditHistory()
  const { saveEdits, exitEdit, saving } = usePixelContext()

  const save = useCallback(async () => {
    // Fold any in-flight (debounced) edit into the batch so a change made just
    // before hitting Save is still sent — and can't fire a stray late commit
    // after exit. (Cancel's revert handles the same window the other way.)
    const drained = drainPendingChanges()
    const batch = drained.length ? [...history.batch, { changes: drained, label: 'edit' }] : history.batch
    if (batch.length === 0) {
      // Nothing to persist — but still reset history so an undone-but-redoable
      // tail from this session can't be redone in the next one.
      history.clear()
      exitEdit()
      return
    }
    try {
      await saveEdits(buildEditPayload(batch))
      // Reset undo/redo: the batch has gone to the agent, so these edits must
      // not be undoable in a later session (we'd be reverting work already sent).
      // The edits stay applied in the live DOM; the agent rewrites source.
      history.clear()
      exitEdit()
    } catch {
      /* stay in edit mode — the provider already surfaced the error */
    }
  }, [history, saveEdits, exitEdit])

  const cancel = useCallback(() => {
    history.discard() // revert the live DOM, then exit
    exitEdit()
  }, [history, exitEdit])

  // Bridge the same actions to the provider's double-Enter / Esc shortcuts.
  useEffect(() => {
    setEditActionHandlers({ save: () => void save(), cancel })
    return () => setEditActionHandlers(null)
  }, [save, cancel])

  return (
    <>
      <button
        type="button"
        className="pixel-rec-btn pixel-rec-save"
        title="Save (double-tap Enter)"
        aria-label="Save"
        onClick={() => void save()}
        disabled={saving}
        data-pixel-tour="save"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path
            d={ICONS.save}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <button
        type="button"
        className="pixel-rec-btn"
        title="Cancel (Esc)"
        aria-label="Cancel"
        onClick={cancel}
        data-pixel-tour="cancel-edit"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path
            d={ICONS.cancel}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </>
  )
}

function EditToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`pixel-rec-btn${on ? ' active' : ''}`}
      title={on ? 'Exit edit mode (Esc)' : 'Edit (double-tap Enter)'}
      aria-label="Edit"
      aria-pressed={on}
      onClick={onToggle}
      data-pixel-tour="edit"
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

/**
 * Time-travel toggle — the rewind clock, sitting just below Edit in the bar.
 * Opens the state-history pane (pixel-react); it does not freeze on its own
 * (that's the pane's list / chevrons). Closing it resumes live capture.
 */
function TimeTravelToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`pixel-rec-btn${on ? ' active' : ''}`}
      title={on ? 'Close state history' : 'State history — time travel'}
      aria-label="State history"
      aria-pressed={on}
      onClick={onToggle}
      data-pixel-tour="time-travel"
    >
      <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
        <path
          d={ICONS.timeTravel}
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

/**
 * "Report a bug" button (bug icon) — records the screen + mic via getDisplayMedia
 * and uploads it (with a metadata sidecar: url, browser, console errors) to the
 * configured Vercel Blob token route. Only renders when `config.bugReport` is
 * set. Self-contained: it doesn't touch the pixel/edit state machine.
 */
function BugButton() {
  const { bugReport } = usePixelContext()
  const [phase, setPhase] = useState<'idle' | 'recording' | 'uploading' | 'sent' | 'error'>('idle')
  const recRef = useRef<BugRecording | null>(null)

  const finalize = useCallback(async () => {
    const rec = recRef.current
    if (!rec || !bugReport) return
    recRef.current = null
    setPhase('uploading')
    try {
      const blob = await rec.blob
      await uploadBugReport(blob, { endpoint: bugReport.endpoint, startedAt: rec.startedAt, meta: bugReport.meta })
      setPhase('sent')
      window.setTimeout(() => setPhase((p) => (p === 'sent' ? 'idle' : p)), 2500)
    } catch (err) {
      console.error('[pixel] bug report upload failed', err)
      setPhase('error')
      window.setTimeout(() => setPhase((p) => (p === 'error' ? 'idle' : p)), 3500)
    }
  }, [bugReport])

  const start = useCallback(async () => {
    try {
      const rec = await startBugRecording()
      recRef.current = rec
      rec.onEnded(() => void finalize()) // browser's own "Stop sharing"
      setPhase('recording')
    } catch {
      setPhase('idle') // user cancelled / denied the screen-share prompt
    }
  }, [finalize])

  const stop = useCallback(() => {
    recRef.current?.stop()
    void finalize()
  }, [finalize])

  if (!bugReport) return null

  const tint = phase === 'sent' ? '#4ade80' : phase === 'error' ? '#f87171' : undefined
  const title =
    phase === 'uploading'
      ? 'Sending bug report…'
      : phase === 'sent'
        ? 'Bug report sent'
        : phase === 'error'
          ? 'Bug report failed — try again'
          : 'Report a bug (records your screen)'

  const button =
    phase === 'recording' ? (
      <button
        type="button"
        className="pixel-rec-btn pixel-bug-recording"
        title="Stop & send bug report"
        aria-label="Stop bug recording"
        onClick={stop}
      >
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
      </button>
    ) : (
      <button
        type="button"
        className="pixel-rec-btn"
        title={title}
        aria-label="Report a bug"
        onClick={() => void start()}
        disabled={phase === 'uploading'}
        style={tint ? { color: tint } : undefined}
      >
        <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
          <path
            d={phase === 'sent' ? ICONS.check : ICONS.bug}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    )

  // A bottom-center toast for the upload outcome (auto-dismisses via the phase
  // reset timers above; sent/error also get a manual dismiss).
  const showToast = phase === 'uploading' || phase === 'sent' || phase === 'error'
  const toastMsg =
    phase === 'uploading' ? 'Sending bug report…' : phase === 'sent' ? 'Bug report sent ✓' : 'Bug report failed — try again'
  const toast = showToast ? (
    <div className={`pixel-bug-toast ${phase}`} role="status" aria-live="polite">
      <span className="pixel-bug-toast-msg">{toastMsg}</span>
      {phase !== 'uploading' && (
        <button
          type="button"
          className="pixel-bug-toast-close"
          aria-label="Dismiss"
          onClick={() => setPhase('idle')}
        >
          ×
        </button>
      )}
    </div>
  ) : null

  return (
    <>
      {button}
      {toast}
    </>
  )
}

/** Leading glyph marking a changelog row as an edit (pencil) or a recording (mic). */
function TaskKindIcon({ kind }: { kind: Task['kind'] }) {
  const edit = kind === 'edit'
  return (
    <span
      className={`pixel-tasks-kind ${edit ? 'edit' : 'recording'}`}
      title={edit ? 'Saved edit' : 'Recording'}
      aria-label={edit ? 'Saved edit' : 'Recording'}
    >
      <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
        <path
          d={edit ? ICONS.edit : ICONS.mic}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** Popup listing the recordings + saved edits the server is tracking, and their status. */
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
    <div className="pixel-tasks" style={anchor} role="dialog" aria-label="Changelog">
      <div className="pixel-tasks-head">Changelog</div>
      {tasks.length === 0 ? (
        <div className="pixel-tasks-empty">Nothing yet.</div>
      ) : (
        <ul className="pixel-tasks-list">
          {tasks.map((t) => (
            <li key={t.id} className="pixel-tasks-item">
              <button
                type="button"
                className="pixel-tasks-open"
                title={`Open folder — ${t.id}`}
                onClick={() => onOpen(t.id)}
              >
                <span className="pixel-tasks-label">
                  <TaskKindIcon kind={t.kind} />
                  <span className="pixel-tasks-id">{formatStamp(t)}</span>
                </span>
                <span className={`pixel-tasks-pill ${t.status}`}>{STATUS_LABEL[t.status]}</span>
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
    timeTravel,
    toggleTimeTravel,
    passthrough,
    setPassthrough,
    bar,
    tasks,
    serverDown,
    openTask,
  } = usePixelContext()
  const recording = state === 'recording'
  const idle = state === 'idle'
  const [minimized, setMinimized] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const containRef = useContainEvents<HTMLDivElement>(true) // bar also contains Esc

  const activeCount = tasks.filter(isActive).length
  // The changelog indicator earns a slot only while **idle** — when there's
  // something to show (active tasks, a server error, or a popup the user
  // opened). While editing or recording it's hidden: edit mode surfaces the
  // in-session change history (undo/redo) instead, and recording keeps the bar
  // focused on the capture controls.
  const showIndicator = idle && !editing && (serverDown || tasks.length > 0 || panelOpen)
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
    `pixel-rec pos-${bar.position}` +
    (vertical ? ' vertical' : '') +
    (idle ? ' idle' : recording ? '' : ' paused') +
    (editing ? ' editing' : '') +
    (minimized ? ' minimized' : '')

  if (minimized) {
    return (
      <>
        <div ref={containRef} className={cls} style={{ opacity: bar.opacity }}>
          {!idle && <span className="pixel-rec-dot" />}
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
      {/* Editing and recording are separated: in edit mode the bar shows the
          edit label + Save/Cancel (no Rec); while recording it shows the rec
          controls (no Edit). Both appear only when idle. */}
      {editing ? (
        <>
          <span className="pixel-rec-edit-dot" />
          <span className="pixel-rec-time">Editing</span>
          <span className="pixel-rec-sep" />
          {/* Save/Cancel lead (the primary edit actions); the mouse-tool toggle
              follows. */}
          <EditControls />
          {/* Mouse tool: ON = select/edit (page inert); OFF (M) = pointer +
              keyboard pass through to the real app. Toggling back re-freezes. */}
          <MouseToolToggle
            on={!passthrough}
            onToggle={() => setPassthrough(!passthrough)}
            titleOn="Mouse tool ON — select & edit, page inert (M)"
            titleOff="Mouse tool OFF — interact with the app (M)"
          />
        </>
      ) : (
        <>
          {idle ? (
            <button
              type="button"
              className="pixel-rec-record"
              title="Start recording (double-tap Space)"
              onClick={() => start()}
              data-pixel-tour="record"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true">
                <path d={ICONS.record} fill="#ef4444" />
              </svg>
              Rec
            </button>
          ) : (
            // While recording/paused the same leading slot becomes the Stop
            // button (a red square where the record dot was), so you stop from
            // exactly where you started; the timer keeps the live/paused cue.
            <button
              type="button"
              className="pixel-rec-record"
              title="Stop (double-tap Space)"
              aria-label="Stop"
              onClick={() => void stop()}
              data-pixel-tour="stop"
            >
              <svg viewBox="0 0 24 24" width="11" height="11" aria-hidden="true" className="pixel-rec-stop-ind">
                <rect x="6" y="6" width="12" height="12" rx="2" fill="#ef4444" />
              </svg>
              <span className="pixel-rec-time">
                {recording ? 'REC' : 'PAUSED'} {formatElapsed(elapsed)}
              </span>
            </button>
          )}

          <span className="pixel-rec-sep" />
          {/* Edit + Time-travel are offered only when idle — hidden while a
              recording is active. Time-travel sits just below Edit. */}
          {idle && <EditToggle on={false} onToggle={toggleEdit} />}
          {idle && <TimeTravelToggle on={timeTravel} onToggle={toggleTimeTravel} />}
          {/* The mouse tool only governs recording's block/passthrough. */}
          {!idle && (
            <MouseToolToggle on={!passthrough} onToggle={() => setPassthrough(!passthrough)} tour="mouse" />
          )}

          {!idle && (
            <>
              <span className="pixel-rec-sep" />
              {recording ? (
                <IconButton icon="pause" label="Pause (Space)" onClick={pause} tour="pause" />
              ) : (
                <IconButton icon="resume" label="Resume (Space)" onClick={resume} tour="pause" />
              )}
              <IconButton icon="cancel" label="Cancel (Esc)" onClick={cancel} stroke tour="cancel" />
            </>
          )}
        </>
      )}

      {/* Task log section: the change-history (edit-log) clock sits at the top,
          above the server task indicator. */}
      {(editing || showIndicator) && (
        <>
          <span className="pixel-rec-sep" />
          {editing && <EditLog />}
          {indicator}
        </>
      )}

      <span className="pixel-rec-sep" />
      {/* Always available (any mode) so a bug can be reported whenever it happens.
          Renders nothing unless `config.bugReport` is set. */}
      <BugButton />
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
    <div className="pixel-save-error" role="alert">
      <span className="pixel-save-error-msg">{message}</span>
      <button
        type="button"
        className="pixel-save-error-btn"
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
  const { saveError, saving, resend } = usePixelContext()
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
    timeTravel,
    passthrough,
    designTokens,
  } = usePixelContext()

  if (typeof document === 'undefined') return null

  const active = state === 'recording' || state === 'paused'
  // Surface the bar (and its indicator) whenever there's status worth showing,
  // even while idle: active recordings on the server, or a connection error.
  const showBar = active || bar.always || serverDown || tasks.length > 0 || editing || timeTravel

  return createPortal(
    <EditHistoryProvider>
      <SelectionProvider>
      <div className={className ? `pixel-overlay ${className}` : 'pixel-overlay'}>
        {showBar && <RecBar />}
        {/* One TokensProvider over BOTH the selection overlay (whose drag handles
            publish snap targets) and the design pane (whose pickers read them),
            so design-token snapping and the pickers share the same token set. */}
        <TokensProvider tokens={designTokens}>
          {editing && <Selection passthrough={passthrough} />}
          {editing && <ElementsPane />}
          {editing && <DesignPane />}
        </TokensProvider>
        {/* While editing a time-traveled version, hide the states pane entirely
            and show the normal edit UI (design pane); resume happens on exit. */}
        {timeTravel && !editing && <StatesPane />}
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
        <Onboarding />
      </div>
      </SelectionProvider>
    </EditHistoryProvider>,
    document.body,
  )
}
