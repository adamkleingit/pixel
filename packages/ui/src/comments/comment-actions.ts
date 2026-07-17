/**
 * Bridge so the provider's Esc shortcut (above the comment UI) can trigger
 * Cancel, whose implementation lives inside the comment layer (needs drafts).
 * Mirrors edit/edit-actions.ts.
 */

export interface CommentActionHandlers {
  save: () => void
  cancel: () => void
}

let handlers: CommentActionHandlers | null = null

export function setCommentActionHandlers(next: CommentActionHandlers | null): void {
  handlers = next
}

export function requestCommentSave(): void {
  handlers?.save()
}

export function requestCommentCancel(): void {
  handlers?.cancel()
}
