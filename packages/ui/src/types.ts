// Public data model for a Pixel recording.

import type { Token, TokenSource } from './pixel-common'

/** One element in the ancestor chain of a click target. */
export interface ElementInfo {
  /** Lowercase tag name, e.g. 'button'. */
  tag: string
  /** Element id, if present. */
  id?: string
  /** Class list. */
  classes: string[]
  /** Trimmed, collapsed, truncated text content, if any. */
  text?: string
}

/** A throttled cursor-position sample. `t` is ms since recording start (t=0). */
export interface PointerSample {
  kind: 'pointer'
  t: number
  x: number
  y: number
}

/** A click. `t` is ms since recording start. `target` is the DOM ancestor chain
 *  from the outermost element down to the innermost element under the cursor. */
export interface ClickEvent {
  kind: 'click'
  t: number
  x: number
  y: number
  button: number
  target: ElementInfo[]
}

/** A rectangular drag selection. `t`/`startT`/`endT` are ms since recording start.
 *  `snapshot` is the filename of the region screenshot (a sidecar PNG), if captured. */
export interface RectEvent {
  kind: 'rect'
  t: number
  startT: number
  endT: number
  x: number
  y: number
  width: number
  height: number
  snapshot?: string
}

/** A point in a freehand stroke, in client coordinates. */
export interface StrokePoint {
  x: number
  y: number
}

/** A freehand annotation drawn with Cmd/Meta + drag while the mouse tool is on.
 *  `t`/`startT`/`endT` are ms since recording start. `x/y/width/height` is the
 *  stroke's bounding box; `snapshot` is the region screenshot (stroke baked in). */
export interface DrawEvent {
  kind: 'draw'
  t: number
  startT: number
  endT: number
  points: StrokePoint[]
  x: number
  y: number
  width: number
  height: number
  snapshot?: string
}

/** A full-viewport screenshot taken at recording start or on resume. The PNG has
 *  a semi-transparent coordinate grid baked in for the agent's spatial context. */
export interface FrameEvent {
  kind: 'frame'
  t: number
  reason: 'start' | 'resume'
  snapshot: string
  width: number
  height: number
}

export type PixelEvent = PointerSample | ClickEvent | RectEvent | DrawEvent | FrameEvent

export interface AudioTrack {
  mime: string
  blob: Blob
}

/** A captured region screenshot, referenced by `RectEvent.snapshot`. */
export interface SnapshotBlob {
  name: string
  blob: Blob
}

/** The single artifact a recording resolves to. */
export interface Recording {
  /** Assigned by the sink/server once persisted. */
  id?: string
  /** Wall-clock epoch ms when recording started (for the record only). */
  startedAt: number
  /** Total recording length in ms. */
  durationMs: number
  /** Spoken-language hint for transcription (e.g. 'hebrew'); chosen in the UI. */
  language?: string
  /** Append-only event stream, sorted by `t`. */
  events: PixelEvent[]
  /** Captured audio, or null if disabled / mic denied. */
  audio: AudioTrack | null
  /** Region screenshots produced by rectangle drags. */
  snapshots: SnapshotBlob[]
}

export type PixelState = 'idle' | 'recording' | 'paused'

/** A recording's processing stage on the server, surfaced in the floating bar. */
export type TaskStatus = 'pending' | 'executing' | 'done' | 'error'

/** One recording the server is tracking, as reported by `RecordingSink.listTasks`. */
export interface Task {
  id: string
  status: TaskStatus
  /** What produced the task: a screen `recording`, a saved `edit` batch, or comments. */
  kind?: 'recording' | 'edit' | 'comment'
  createdAt?: number
  durationMs?: number
  eventCount?: number
  /** For finished tasks: the agent's summary (status 'done') or error message. */
  summary?: string
  message?: string
}

/** One committed change from edit mode, serialized for the agent to apply to
 *  source. `target` is the DOM ancestor chain (outermost → innermost) of the
 *  edited element — the same shape as a recording click target, so the agent
 *  resolves it the same way. */
export interface EditChangeRecord {
  target: ElementInfo[]
  /** What surface changed. `move` reorders within the parent (before/after are
   *  child indices). `html` replaces innerHTML (mixed-content inline edit).
   *  `insert` / `remove` add / remove the element (duplicate / delete). */
  kind: 'style' | 'text' | 'attr' | 'move' | 'html' | 'insert' | 'remove'
  /** CSS property / attribute name; '' for text, move, html, insert, and remove. */
  name: string
  before: string
  after: string
  /** Present when `after` was bound to a design token (picker or snap). The
   *  agent writes the token's symbolic spelling (`usage`) in source instead of
   *  the resolved `after` value. Absent for raw edits. */
  source?: TokenSource
}

/** A saved batch of edit-mode changes — the "Save" analog of a Recording. */
export interface EditPayload {
  /** The page the edits were made on. */
  url: string
  createdAt: number
  changes: EditChangeRecord[]
}

/** One pin left in comment mode, serialized for the agent. */
export interface CommentRecord {
  /** DOM ancestor chain (outermost → innermost) — same shape as a recording click. */
  target: ElementInfo[]
  /** The note the user typed. */
  body: string
  /** Click position in client coordinates (where the pin was placed). */
  x: number
  y: number
}

/** A saved batch of comments — the "Save" analog of a Recording / EditPayload. */
export interface CommentPayload {
  url: string
  createdAt: number
  comments: CommentRecord[]
}

/** Where a finished recording is sent. The default is an HTTP sink (see `httpSink`). */
export interface RecordingSink {
  save(rec: Recording): Promise<{ id: string }>
  /**
   * Optional: persist a batch of edit-mode changes (the "Save" button / double-
   * Enter). Written to the same dropbox the agent watches, so it's picked up
   * exactly like a recording. Omit to disable saving edits.
   */
  saveEdits?(payload: EditPayload): Promise<{ id: string }>
  /**
   * Optional: persist a batch of comments from comment mode. Written to the same
   * dropbox the agent watches (`comments.json`). Omit to disable saving comments.
   */
  saveComments?(payload: CommentPayload): Promise<{ id: string }>
  /**
   * Optional: list the recordings the server currently knows about, for the
   * floating-bar status indicator. The provider polls this when present; a
   * rejection is treated as "server unreachable". Omit to disable the indicator.
   */
  listTasks?(): Promise<Task[]>
  /**
   * Optional: reveal a recording's folder in the OS file manager. The server
   * runs the native open command (the browser can't), so this is only useful
   * with a local sink. Wired to row clicks in the tasks popup when present.
   */
  openTask?(id: string): Promise<void>
  /**
   * Optional: fetch the project's design tokens, which the server (`@getpixel/
   * server`) extracts from the project and serves at GET /tokens. Drives the
   * design-pane token pickers and the on-canvas drag snap-to-token. Omit to run
   * without tokens (pickers stay empty, drags scrub freely).
   */
  fetchTokens?(): Promise<{ tokens: Token[] }>
}

export interface ActivationConfig {
  /** Master switch for the keyboard shortcut. Default true. */
  enabled?: boolean
  /** Key (KeyboardEvent.code) that toggles recording on a double-tap. Default 'Space'. */
  key?: string
  /** Max ms between the two taps to count as a double-tap. Default 400. */
  doubleTapMs?: number
}

export type BarPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'center-left'
  | 'center-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export interface BarConfig {
  /** Show the floating bar even when idle (with a Record button). Default false. */
  always?: boolean
  /** Where the bar sits. center-left/center-right lay out vertically. Default 'center-right'. */
  position?: BarPosition
  /** Bar opacity 0–1 (full on hover). Default 0.3. */
  opacity?: number
}

export interface PixelConfig {
  /** Floating control bar appearance. */
  bar?: BarConfig
  /**
   * Let page clicks/typing through to the app while recording. Default false —
   * by default the page is inert (interactions are recorded but the app doesn't
   * react). Pausing always makes the page live regardless of this setting.
   */
  passthrough?: boolean
  /** Capture microphone audio. Default true. */
  audio?: boolean
  /** Spoken-language hint for transcription (e.g. 'hebrew'). Read at recording start. */
  language?: string
  /** Pointer sampling rate in Hz. Default 30. */
  pointerHz?: number
  /** Keep recording this many ms after stop is requested (people click early). Default 500. */
  stopDelayMs?: number
  /** Where the finished recording goes. If omitted, recordings are only surfaced via onComplete. */
  sink?: RecordingSink
  /** Double-tap-to-toggle keyboard activation. */
  activation?: ActivationConfig
  /**
   * How often (ms) to poll the sink for task status, driving the floating-bar
   * indicator. Only polls if the sink implements `listTasks`. Default 4000.
   * Set to 0 to disable polling.
   */
  taskPollMs?: number
  /**
   * "Report a bug" button. When set, the floating bar shows a bug button that
   * records the screen (+ mic) and uploads it — with a metadata sidecar — to a
   * Vercel Blob client-upload token route at `endpoint`. `meta` is merged into
   * every report's meta.json (e.g. app name/version). Omit to hide the button.
   */
  bugReport?: BugReportConfig
  /**
   * First-run onboarding. When Pixel first loads it points out the Record / Edit
   * / Time-travel buttons, then walks through the recording and editing controls
   * the first time each is used. Each step is dismissed forever (persisted in
   * localStorage). Set `false` to disable entirely. Default true.
   */
  onboarding?: boolean
}

export interface BugReportConfig {
  /** The Vercel client-upload token route, e.g.
   *  `https://your-endpoint.vercel.app/api/bug-report`. */
  endpoint: string
  /** Extra fields merged into each report's meta.json (app name, version, …). */
  meta?: Record<string, unknown>
}
