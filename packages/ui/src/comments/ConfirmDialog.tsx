import type { ReactNode } from 'react'
import { OWN_UI_PROPS } from '../own-ui'

export interface ConfirmDialogProps {
  title: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}

/** Centered Pixel chrome alertdialog used for discard confirms (edit / comment). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Discard',
  cancelLabel = 'Keep',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="pixel-confirm-backdrop" role="presentation" {...OWN_UI_PROPS}>
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
    </div>
  )
}
