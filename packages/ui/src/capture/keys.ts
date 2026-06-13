import type { ActivationConfig } from '../types'

function isEditableTarget(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable
  )
}

export interface KeyHandlers {
  /** A single tap of the activation key (pause/resume). */
  onSingle: () => void
  /** A double tap of the activation key (start/stop). */
  onDouble: () => void
  /** Escape pressed (cancel). */
  onEscape: () => void
}

/**
 * Installs document-level shortcuts:
 *  - one tap of the activation key  → onSingle
 *  - two taps within doubleTapMs    → onDouble
 *  - Escape                         → onEscape
 * Ignored while focus is in a text field. The activation key's default action
 * (Space scrolling) is suppressed. Returns a cleanup function.
 */
export function installKeyboard(
  config: ActivationConfig | undefined,
  handlers: KeyHandlers,
): () => void {
  const key = config?.key ?? 'Space'
  const doubleTapMs = config?.doubleTapMs ?? 350

  let pending: ReturnType<typeof setTimeout> | null = null

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && !isEditableTarget()) {
      handlers.onEscape()
      return
    }
    if (e.code !== key || e.repeat || isEditableTarget()) return

    e.preventDefault()
    if (pending !== null) {
      clearTimeout(pending)
      pending = null
      handlers.onDouble()
    } else {
      pending = setTimeout(() => {
        pending = null
        handlers.onSingle()
      }, doubleTapMs)
    }
  }

  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    if (pending !== null) clearTimeout(pending)
    document.removeEventListener('keydown', onKeyDown, true)
  }
}
