import { useScreenshareContext } from './context'
import type { Recording, ScreenshareState } from './types'

export interface UseScreenshare {
  state: ScreenshareState
  start: () => void
  stop: () => void
  pause: () => void
  resume: () => void
  cancel: () => void
  /** Start if idle, stop otherwise. */
  toggle: () => void
  /** Live interaction mode: true = page clicks/typing pass through. */
  passthrough: boolean
  setPassthrough: (v: boolean) => void
  /** The most recently completed recording, if any. */
  lastRecording: Recording | null
}

/** Drive and observe recording from anywhere under the provider. */
export function useScreenshare(): UseScreenshare {
  const { state, start, stop, pause, resume, cancel, toggle, passthrough, setPassthrough, lastRecording } =
    useScreenshareContext()
  return { state, start, stop, pause, resume, cancel, toggle, passthrough, setPassthrough, lastRecording }
}
