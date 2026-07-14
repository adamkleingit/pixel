// First-run onboarding progress, persisted in localStorage so each step is shown
// once and then "removed forever". One boolean per stage; a stage flips true when
// the user dismisses it (or when it's skipped because its targets never appear).

export type OnbStage = 'welcome' | 'recording' | 'postRecording' | 'editing' | 'commenting'

export type OnbFlags = Record<OnbStage, boolean>

const KEY = 'pixel:onboarding:v1'

const DEFAULT: OnbFlags = {
  welcome: false,
  recording: false,
  postRecording: false,
  editing: false,
  commenting: false,
}

/** Read the persisted flags, tolerating absent/corrupt storage (→ all false). */
export function readFlags(): OnbFlags {
  if (typeof localStorage === 'undefined') return { ...DEFAULT }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT }
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<OnbFlags>) }
  } catch {
    return { ...DEFAULT }
  }
}

/** Mark a stage done and persist. Returns the updated flags. */
export function completeStage(stage: OnbStage): OnbFlags {
  const next = { ...readFlags(), [stage]: true }
  try {
    localStorage?.setItem(KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the in-memory flags still advance for this session */
  }
  return next
}
