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
  /** Escape pressed (cancel / exit edit). */
  onEscape: () => void
  /**
   * A double tap of Enter (enter edit mode / save). Optional — only wired when
   * the editing surface is present. Enter's default action is left untouched
   * (no preventDefault), so the app's own Enter handling on forms/buttons keeps
   * working; only a *double* tap outside a text field triggers this.
   */
  onEditDouble?: () => void
}

/**
 * Installs document-level shortcuts:
 *  - one tap of the activation key  → onSingle
 *  - two taps within doubleTapMs    → onDouble
 *  - two taps of Enter within window → onEditDouble (if provided)
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
  let editPending: ReturnType<typeof setTimeout> | null = null

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape' && !isEditableTarget()) {
      handlers.onEscape()
      return
    }
    // Double-tap Enter → edit toggle / save. Deliberately no preventDefault: a
    // single Enter must still reach the app (forms, buttons). Only the second
    // tap within the window fires.
    if (handlers.onEditDouble && e.code === 'Enter' && !e.repeat && !isEditableTarget()) {
      if (editPending !== null) {
        clearTimeout(editPending)
        editPending = null
        handlers.onEditDouble()
      } else {
        editPending = setTimeout(() => {
          editPending = null
        }, doubleTapMs)
      }
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
    if (editPending !== null) clearTimeout(editPending)
    document.removeEventListener('keydown', onKeyDown, true)
  }
}
