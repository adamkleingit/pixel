import { createContext, useContext } from 'react'
import type { BlipData } from './draw/blip'
import type { Token } from './pixel-common'
import type { BarPosition, EditPayload, Recording, ScreenshareState, StrokePoint, Task } from './types'

export interface ResolvedBarConfig {
  always: boolean
  position: BarPosition
  opacity: number
}

export interface RectShape {
  x: number
  y: number
  width: number
  height: number
}

export interface RectFlash extends RectShape {
  id: number
}

/** A freehand stroke (Cmd+drag), as client-coord points. */
export interface StrokeShape {
  points: StrokePoint[]
}

/** A committed stroke (keyed for rendering). Visible until Cmd is released. */
export interface Stroke extends StrokeShape {
  id: number
}

/** Internal context shared between the provider, the overlay, and the public hook. */
export interface ScreenshareContextValue {
  state: ScreenshareState
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  cancel: () => void
  toggle: () => void
  /**
   * Edit mode. Orthogonal to `state` (recording) — you can edit and record at
   * once; both belong to one session (see complete-refactor.md §4.3).
   */
  editing: boolean
  enterEdit: () => void
  exitEdit: () => void
  toggleEdit: () => void
  /** Persist a batch of edit-mode changes to the sink (Save). Rejects on failure
   *  so the caller can keep the user in edit mode. No-op sink → rejects. */
  saveEdits: (payload: EditPayload) => Promise<{ id: string }>
  /** Live interaction mode: true = clicks pass through to the page. */
  passthrough: boolean
  setPassthrough: (v: boolean) => void
  /** Resolved floating-bar appearance config. */
  bar: ResolvedBarConfig
  lastRecording: Recording | null
  /** Human-readable message when the last save to the sink failed; null otherwise. */
  saveError: string | null
  /** True while a save (or resend) is in flight. */
  saving: boolean
  /** Re-attempt sending the last recording that failed to save. No-op if none. */
  resend: () => void
  /** Recordings the server is tracking (polled). Empty if none or polling is off. */
  tasks: Task[]
  /** True when the last task poll failed — the server appears to be unreachable. */
  serverDown: boolean
  /** Reveal a recording's folder in the OS file manager (no-op if the sink can't). */
  openTask: (id: string) => void
  /** The project's design tokens, fetched from the sink (GET /tokens). Empty when
   *  the sink can't fetch or none are detected. Feeds the design-pane pickers and
   *  the on-canvas drag snap-to-token. */
  designTokens: Token[]
  /** Active radar blips (overlay-only concern). */
  blips: BlipData[]
  removeBlip: (id: number) => void
  /** The rectangle currently being dragged, if any. */
  dragRect: RectShape | null
  /** Completed rectangles fading out. */
  rectFlashes: RectFlash[]
  removeRectFlash: (id: number) => void
  /** The freehand stroke currently being drawn (Cmd+drag), if any. */
  drawStroke: StrokeShape | null
  /** Committed strokes, kept visible until the Cmd key is released. */
  drawStrokes: Stroke[]
}

export const ScreenshareContext = createContext<ScreenshareContextValue | null>(null)

export function useScreenshareContext(): ScreenshareContextValue {
  const ctx = useContext(ScreenshareContext)
  if (!ctx) {
    throw new Error('Screenshare components must be used within <ScreenshareProvider>')
  }
  return ctx
}
