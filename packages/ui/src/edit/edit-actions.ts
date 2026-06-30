/**
 * edit-actions — a tiny module bridge so the keyboard layer (installed by the
 * provider, which sits *above* the EditHistoryProvider) can trigger Save /
 * Cancel, whose implementations live *inside* the edit layer (they need the edit
 * batch + sink). The edit controls register handlers on mount; the provider's
 * double-Enter / Esc shortcuts call these. Mirrors the `setReporterCommit`
 * bridge in change-reporter.
 */

export interface EditActionHandlers {
  /** Persist the batch (Save). */
  save: () => void
  /** Revert the batch and exit (Cancel). */
  cancel: () => void
}

let handlers: EditActionHandlers | null = null

export function setEditActionHandlers(next: EditActionHandlers | null): void {
  handlers = next
}

export function requestEditSave(): void {
  handlers?.save()
}

export function requestEditCancel(): void {
  handlers?.cancel()
}
