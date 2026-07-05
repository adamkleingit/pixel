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

/** True if `el` has at least one direct, non-whitespace text node. */
function hasDirectText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '') return true
  }
  return false
}

/**
 * True for a *mixed-content* inline element — one that interleaves raw text with
 * child elements (a `<p>` with `<span class="kbd">` / `<strong>` runs). These
 * can't use the plaintext path (contenteditable would flatten the children away
 * on commit), so we edit their **innerHTML as raw markup** instead: show the
 * markup as literal text, let the user edit it, and re-parse it on commit.
 *
 * Gated on having *both* child elements AND loose text so pure containers
 * (layout `<div>`s with only element children, no stray text) keep drilling to
 * select on double-click rather than turning into an HTML editor.
 */
export function isHtmlEditable(el: Element | null): el is HTMLElement {
  if (!el || !(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return false
  if (NON_TEXT_EDITABLE_TAGS.has(el.tagName.toLowerCase())) return false
  if (el.children.length === 0) return false
  return hasDirectText(el)
}

/** Either a pure-text leaf (plaintext edit) or a mixed inline element (innerHTML
 *  edit) — the set of elements a double-click begins an inline edit on. */
export function isInlineEditable(el: Element | null): el is HTMLElement {
  return isTextEditable(el) || isHtmlEditable(el)
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

export function beginInlineEdit(
  element: HTMLElement,
  commit: CommitFn,
  /** Other selected elements to apply the same edit to (canvas multi-edit). The
   *  new text/value is mirrored onto every compatible peer and recorded in the
   *  same commit batch, so one gesture = one undo step across all of them. */
  peers: HTMLElement[] = [],
): InlineEditSession | null {
  const inner =
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
      ? beginInputInlineEdit(element, commit, peers)
      : isHtmlEditable(element)
        ? beginHtmlInlineEdit(element, commit, peers)
        : beginTextInlineEdit(element, commit, peers)
  element.setAttribute(INLINE_EDITING_ATTR, '')
  return {
    element: inner.element,
    exit(options) {
      inner.exit(options)
      element.removeAttribute(INLINE_EDITING_ATTR)
    },
  }
}

function beginTextInlineEdit(
  element: HTMLElement,
  commit: CommitFn,
  peers: HTMLElement[] = [],
): InlineEditSession {
  const originalText = element.textContent ?? ''
  // Peers that can take a text edit (text-editable, non-input): mirror the new
  // text onto them on commit. Capture each one's pre-edit text for undo.
  const textPeers = peers.filter(
    (p) =>
      p !== element &&
      !(p instanceof HTMLInputElement) &&
      !(p instanceof HTMLTextAreaElement) &&
      isTextEditable(p),
  )
  const peerOriginalText = new Map(textPeers.map((p) => [p, p.textContent ?? '']))
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
      // The anchor's text is already applied (edited live). Mirror onto peers and
      // record every element in one batch so undo reverts all together.
      const changes: Change[] = [
        { target: element, kind: 'text', name: '', before: originalText, after: newText },
      ]
      for (const peer of textPeers) {
        const before = peerOriginalText.get(peer) ?? ''
        if (before === newText) continue
        peer.textContent = newText
        changes.push({ target: peer, kind: 'text', name: '', before, after: newText })
      }
      commit(changes, 'text')
    }
  }

  return { element, exit }
}

/**
 * Mixed-content inline edit: swap the element's rendered content for its raw
 * innerHTML *as literal text*, let the user edit the markup, then re-parse it
 * back into DOM on commit and record it as an `html` change (before/after are
 * innerHTML strings). Structurally mirrors `beginTextInlineEdit`, but every
 * read/write is innerHTML instead of textContent so child elements survive.
 */
function beginHtmlInlineEdit(
  element: HTMLElement,
  commit: CommitFn,
  peers: HTMLElement[] = [],
): InlineEditSession {
  const originalHTML = element.innerHTML
  const htmlPeers = peers.filter((p) => p !== element && isHtmlEditable(p))
  const peerOriginalHTML = new Map(htmlPeers.map((p) => [p, p.innerHTML]))
  const originalContentEditable = element.getAttribute('contenteditable')
  const originalSpellcheck = element.getAttribute('spellcheck')
  let exited = false

  const restoreInertness = liftInertness(element)
  // Show the markup as literal, editable text (this drops the live child nodes
  // for the duration of the edit; commit/cancel re-parses innerHTML back).
  element.textContent = originalHTML
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
    // The edited markup is currently the element's text — read it, then blur.
    const newHTML = element.textContent ?? ''
    element.blur()
    restoreInertness()
    if (options?.commit === false) {
      element.innerHTML = originalHTML // discard: re-parse the original markup
      return
    }
    // Re-parse the (possibly edited) markup back into real DOM.
    element.innerHTML = newHTML
    if (newHTML !== originalHTML) {
      const changes: Change[] = [
        { target: element, kind: 'html', name: '', before: originalHTML, after: newHTML },
      ]
      for (const peer of htmlPeers) {
        const before = peerOriginalHTML.get(peer) ?? ''
        if (before === newHTML) continue
        peer.innerHTML = newHTML
        changes.push({ target: peer, kind: 'html', name: '', before, after: newHTML })
      }
      commit(changes, 'html')
    }
  }

  return { element, exit }
}

function beginInputInlineEdit(
  element: HTMLInputElement | HTMLTextAreaElement,
  commit: CommitFn,
  peers: HTMLElement[] = [],
): InlineEditSession {
  const originalValue = element.value
  const originalPlaceholder = element.getAttribute('placeholder') ?? ''
  const target: 'value' | 'placeholder' = originalValue ? 'value' : 'placeholder'
  // Peer inputs/textareas receive the same value/placeholder on commit.
  const inputPeers = peers.filter(
    (p): p is HTMLInputElement | HTMLTextAreaElement =>
      p !== element && (p instanceof HTMLInputElement || p instanceof HTMLTextAreaElement),
  )
  const peerOriginalValue = new Map(inputPeers.map((p) => [p, p.value]))
  const peerOriginalPlaceholder = new Map(
    inputPeers.map((p) => [p, p.getAttribute('placeholder') ?? '']),
  )
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
      const changes: Change[] = [
        { target: element, kind: 'attr', name: 'value', before: originalValue, after: typed },
      ]
      for (const peer of inputPeers) {
        const before = peerOriginalValue.get(peer) ?? ''
        if (before === typed) continue
        peer.value = typed
        changes.push({ target: peer, kind: 'attr', name: 'value', before, after: typed })
      }
      commit(changes, 'value')
    } else {
      element.value = originalValue // placeholder was seeded into value — restore runtime value
      if (typed === originalPlaceholder) return
      const changes: Change[] = [
        {
          target: element,
          kind: 'attr',
          name: 'placeholder',
          before: originalPlaceholder,
          after: typed,
        },
      ]
      for (const peer of inputPeers) {
        const before = peerOriginalPlaceholder.get(peer) ?? ''
        if (before === typed) continue
        peer.setAttribute('placeholder', typed)
        changes.push({ target: peer, kind: 'attr', name: 'placeholder', before, after: typed })
      }
      commit(changes, 'placeholder')
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
