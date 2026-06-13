// Public data model for a Screenshare recording.

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

export type ScreenshareEvent = PointerSample | ClickEvent | RectEvent | FrameEvent

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
  events: ScreenshareEvent[]
  /** Captured audio, or null if disabled / mic denied. */
  audio: AudioTrack | null
  /** Region screenshots produced by rectangle drags. */
  snapshots: SnapshotBlob[]
}

export type ScreenshareState = 'idle' | 'recording' | 'paused'

/** Where a finished recording is sent. The default is an HTTP sink (see `httpSink`). */
export interface RecordingSink {
  save(rec: Recording): Promise<{ id: string }>
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

export interface ScreenshareConfig {
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
}
