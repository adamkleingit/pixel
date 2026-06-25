/**
 * Inline text editing — double-click a selected text element to edit it in
 * place. Ported/condensed from Pixel's `inline-text-edit.ts`, kept structurally
 * close: contenteditable for text elements; `value`/`placeholder` for textual
 * `<input>`/`<textarea>`. The only seam change is the commit sink — instead of
 * Pixel's `commitChangeBatch` (agent RPC), edits commit through the in-app
 * change tracker (a `commit` callback the caller passes from `useEditHistory`).
 */
import type { Change } from './edit-history'

export interface InlineEditSession {
  element: HTMLElement
  exit(options?: { commit?: boolean }): void
}

export type CommitFn = (changes: Change[], label?: string) => void

const TEXTUAL_INPUT_TYPES = new Set([
  '', 'text', 'search', 'email', 'url', 'tel', 'password', 'number',
])
const NON_TEXT_EDITABLE_TAGS = new Set([
  'form', 'fieldset', 'datalist', 'select', 'option', 'optgroup', 'output', 'progress', 'meter',
])

export function isTextEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement) return TEXTUAL_INPUT_TYPES.has(el.type.toLowerCase())
  if (el instanceof HTMLTextAreaElement) return true
  if (NON_TEXT_EDITABLE_TAGS.has(el.tagName.toLowerCase())) return false
  // A leaf with no element children — its visible content is purely text, so
  // contenteditable can't clobber child elements.
  return el.children.length === 0
}

/** Lift disabled/readonly for the edit (they block focus/typing); restore on exit. */
function liftInertness(element: HTMLElement): () => void {
  const el = element as HTMLElement & { disabled?: boolean; readOnly?: boolean }
  const wasDisabled = el.disabled === true
  const wasReadOnly = el.readOnly === true
  if (wasDisabled) el.disabled = false
  if (wasReadOnly) el.readOnly = false
  return () => {
    if (wasDisabled) el.disabled = true
    if (wasReadOnly) el.readOnly = true
  }
}

/** Marks the element under an inline edit so the edit-mode stylesheet restores a
 *  text caret + native selection on it (see styles `[data-pixel-editing]`). */
const INLINE_EDITING_ATTR = 'data-pixel-editing'

export function beginInlineEdit(element: HTMLElement, commit: CommitFn): InlineEditSession | null {
  const inner =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? beginInputInlineEdit(element, commit)
      : beginTextInlineEdit(element, commit)
  element.setAttribute(INLINE_EDITING_ATTR, '')
  return {
    element: inner.element,
    exit(options) {
      inner.exit(options)
      element.removeAttribute(INLINE_EDITING_ATTR)
    },
  }
}

function beginTextInlineEdit(element: HTMLElement, commit: CommitFn): InlineEditSession {
  const originalText = element.textContent ?? ''
  const originalContentEditable = element.getAttribute('contenteditable')
  const originalSpellcheck = element.getAttribute('spellcheck')
  let exited = false

  const restoreInertness = liftInertness(element)
  element.setAttribute('contenteditable', 'plaintext-only')
  element.setAttribute('spellcheck', 'false')
  element.focus()
  selectAllText(element)

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      exit({ commit: false })
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      e.stopPropagation()
      exit({ commit: true })
    }
  }
  function onBlur() {
    exit({ commit: true })
  }

  element.addEventListener('keydown', onKeyDown)
  element.addEventListener('blur', onBlur)

  function exit(options?: { commit?: boolean }) {
    if (exited) return
    exited = true
    element.removeEventListener('keydown', onKeyDown)
    element.removeEventListener('blur', onBlur)
    if (originalContentEditable === null) element.removeAttribute('contenteditable')
    else element.setAttribute('contenteditable', originalContentEditable)
    if (originalSpellcheck === null) element.removeAttribute('spellcheck')
    else element.setAttribute('spellcheck', originalSpellcheck)
    const newText = element.textContent ?? ''
    element.blur()
    restoreInertness()
    if (options?.commit === false) {
      element.textContent = originalText
      return
    }
    if (newText !== originalText) {
      // The text is already applied (we edited it live); record it so undo works.
      commit([{ target: element, kind: 'text', name: '', before: originalText, after: newText }], 'text')
    }
  }

  return { element, exit }
}

function beginInputInlineEdit(
  element: HTMLInputElement | HTMLTextAreaElement,
  commit: CommitFn,
): InlineEditSession {
  const originalValue = element.value
  const originalPlaceholder = element.getAttribute('placeholder') ?? ''
  const target: 'value' | 'placeholder' = originalValue ? 'value' : 'placeholder'
  let exited = false
  const restoreInertness = liftInertness(element)

  // addEventListener on the (HTMLInputElement | HTMLTextAreaElement) union
  // doesn't typecheck, so bind listeners through the common HTMLElement.
  const node: HTMLElement = element

  if (target === 'placeholder') element.value = originalPlaceholder

  queueMicrotask(() => {
    if (exited) return
    element.focus()
    element.select?.()
  })

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      exit({ commit: false })
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      exit({ commit: true })
    }
  }
  function onBlur() {
    exit({ commit: true })
  }

  node.addEventListener('keydown', onKeyDown)
  node.addEventListener('blur', onBlur)

  function exit(options?: { commit?: boolean }) {
    if (exited) return
    exited = true
    node.removeEventListener('keydown', onKeyDown)
    node.removeEventListener('blur', onBlur)
    const typed = element.value
    element.blur()
    restoreInertness()
    if (options?.commit === false) {
      element.value = originalValue
      return
    }
    if (target === 'value') {
      if (typed === originalValue) {
        element.value = originalValue
        return
      }
      element.value = typed // keep the edit visible (in-app: the commit IS the change)
      commit(
        [{ target: element, kind: 'attr', name: 'value', before: originalValue, after: typed }],
        'value',
      )
    } else {
      element.value = originalValue // placeholder was seeded into value — restore runtime value
      if (typed === originalPlaceholder) return
      commit(
        [
          {
            target: element,
            kind: 'attr',
            name: 'placeholder',
            before: originalPlaceholder,
            after: typed,
          },
        ],
        'placeholder',
      )
    }
  }

  return { element, exit }
}

function selectAllText(element: HTMLElement): void {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(element)
  sel.removeAllRanges()
  sel.addRange(range)
}
