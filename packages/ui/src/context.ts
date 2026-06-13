import { createContext, useContext } from 'react'
import type { BlipData } from './draw/blip'
import type { BarPosition, Recording, ScreenshareState } from './types'

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

/** Internal context shared between the provider, the overlay, and the public hook. */
export interface ScreenshareContextValue {
  state: ScreenshareState
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  cancel: () => void
  toggle: () => void
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
  /** Active radar blips (overlay-only concern). */
  blips: BlipData[]
  removeBlip: (id: number) => void
  /** The rectangle currently being dragged, if any. */
  dragRect: RectShape | null
  /** Completed rectangles fading out. */
  rectFlashes: RectFlash[]
  removeRectFlash: (id: number) => void
}

export const ScreenshareContext = createContext<ScreenshareContextValue | null>(null)

export function useScreenshareContext(): ScreenshareContextValue {
  const ctx = useContext(ScreenshareContext)
  if (!ctx) {
    throw new Error('Screenshare components must be used within <ScreenshareProvider>')
  }
  return ctx
}
