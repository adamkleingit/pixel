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
  /** Edit mode — orthogonal to recording; both can be on at once (one session). */
  editing: boolean
  enterEdit: () => void
  exitEdit: () => void
  toggleEdit: () => void
  /** Live interaction mode: true = page clicks/typing pass through. */
  passthrough: boolean
  setPassthrough: (v: boolean) => void
  /** The most recently completed recording, if any. */
  lastRecording: Recording | null
  /** Message when the last save to the sink failed (server down, etc.); null otherwise. */
  saveError: string | null
  /** True while a save (or resend) is in flight. */
  saving: boolean
  /** Re-attempt sending the recording that last failed to save. */
  resend: () => void
}

/** Drive and observe recording from anywhere under the provider. */
export function useScreenshare(): UseScreenshare {
  const {
    state, start, stop, pause, resume, cancel, toggle,
    editing, enterEdit, exitEdit, toggleEdit,
    passthrough, setPassthrough, lastRecording, saveError, saving, resend,
  } = useScreenshareContext()
  return {
    state, start, stop, pause, resume, cancel, toggle,
    editing, enterEdit, exitEdit, toggleEdit,
    passthrough, setPassthrough, lastRecording, saveError, saving, resend,
  }
}
