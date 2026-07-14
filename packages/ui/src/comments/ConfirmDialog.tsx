import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { OWN_UI_PROPS } from '../own-ui'

export interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Centered Pixel chrome alertdialog used for discard confirms (edit / comment).
 *  Portaled to `document.body` so a transformed bar (`.pixel-rec` uses
 *  translateY) can't clip or shove it off-screen. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Discard',
  cancelLabel = 'Keep',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className="pixel-confirm-backdrop"
      role="presentation"
      {...OWN_UI_PROPS}
      onMouseDown={(e) => {
        // Click on the dimmed backdrop = Keep (dismiss without discarding).
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div
        className="pixel-confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="pixel-confirm-title"
        aria-describedby="pixel-confirm-msg"
      >
        <div id="pixel-confirm-title" className="pixel-confirm-title">
          {title}
        </div>
        <div id="pixel-confirm-msg" className="pixel-confirm-msg">
          {message}
        </div>
        <div className="pixel-confirm-actions">
          <button type="button" className="pixel-confirm-btn keep" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="pixel-confirm-btn discard" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
