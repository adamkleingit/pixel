import { useEffect, useRef, useState } from 'react'
import type { Change } from '../agent-client'
import { commitChangeBatch } from '../edit/change-reporter'
import { Row } from './Row'
import { Section } from './Section'
import { MULTIPLE_PLACEHOLDER, readShared, sharedDisplayValue } from './read-shared'
import { COLORS, SIZES } from './tokens'

/**
 * ContentSection — edits the text content of the selected element(s), shown at
 * the top of the Design panel. The same edit you'd make by double-clicking the
 * element on the canvas, surfaced as a field so it's reachable without hunting
 * for the text under the selection handles.
 *
 * Only rendered for "text leaf" elements — those whose visible content is pure
 * text (no element children) so writing `textContent` can't clobber nested
 * markup. `<input>` / `<textarea>` are excluded; their text lives in `value` /
 * `placeholder` and is handled by `InputSection`.
 *
 * A **Multiline** toggle makes line-break intent explicit. Off (default): Enter
 * commits and blurs, single-line. On: Enter inserts newlines and the commit
 * also writes `white-space: pre-line` so the breaks actually render (matching
 * the inline canvas editor's Enter behavior).
 *
 * Commits through `commitChangeBatch` — the same pipeline the inline editor and
 * drag gestures use — fanning out across every selected variant in multi-edit.
 */

export interface ContentSectionProps {
  elements?: Element[]
}

/** A text leaf whose `textContent` is safe to edit wholesale: an HTML element
 *  that isn't a form field and carries text with no element children. */
function isTextLeaf(el: Element): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return false
  if (el.children.length > 0) return false
  return (el.textContent ?? '').trim().length > 0
}

/** `pre`, `pre-line`, `pre-wrap` — the white-space values that render newlines. */
function rendersNewlines(el: HTMLElement): boolean {
  return /^pre/.test(getComputedStyle(el).whiteSpace)
}

export function ContentSection({ elements = [] }: ContentSectionProps = {}) {
  const [text, setText] = useState('')
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [multiline, setMultiline] = useState(false)
  // Set by Escape so the blur it triggers reverts instead of committing.
  const revertingRef = useRef(false)

  // Editing `textContent` is only safe when every selected element is a text
  // leaf — otherwise a write would erase nested elements on one of the peers.
  const editable = elements.length > 0 && elements.every(isTextLeaf)

  useEffect(() => {
    if (!editable) {
      setText(''); setShared('single'); setMultiline(false); return
    }
    const v = readShared(elements, el => el.textContent ?? '')
    setText(sharedDisplayValue(v))
    setShared(v.kind === 'multiple' ? 'multiple' : 'single')
    // Seed the toggle from reality: an element already showing line breaks
    // (pre-* white-space) or carrying newline characters is multiline.
    const primary = elements[0] as HTMLElement
    setMultiline(rendersNewlines(primary) || (primary.textContent ?? '').includes('\n'))
  }, [elements, editable])

  if (!editable) return null

  // Commit on blur / Enter / toggle. Capture the pre-change HTML, report one
  // atomic batch (text + optional white-space) for the agent, then mirror the
  // result onto every selected element's live DOM. `nextMultiline` is passed
  // explicitly so a checkbox toggle commits its new value without a state race.
  function commit(nextText: string, nextMultiline: boolean) {
    const primary = elements[0] as HTMLElement
    const previousText = primary.textContent ?? ''
    const textChanged = nextText !== previousText

    // Add `white-space: pre-line` when turning multiline on (so breaks render);
    // revert to `normal` when turning it off, but only when the element is
    // currently pre-* — never write a spurious no-op onto plain text.
    const currentlyPre = rendersNewlines(primary)
    const whiteSpace = nextMultiline && !currentlyPre ? 'pre-line'
      : !nextMultiline && currentlyPre ? 'normal'
      : null

    if (!textChanged && whiteSpace === null) return
    // Seam: Pixel's elements lived in a tile ShadowRoot; in-app they live in the
    // live document. Accept both. (htmlBefore is unused by the in-app reporter.)
    const root = primary.getRootNode()
    if (!(root instanceof ShadowRoot) && !(root instanceof Document)) return
    const htmlBefore = root instanceof ShadowRoot ? root.innerHTML : ''

    const changes: Change[] = []
    if (textChanged) changes.push({ property: 'text', previousValue: previousText, newValue: nextText })
    if (whiteSpace !== null) {
      changes.push({ property: 'white-space', previousValue: primary.style.whiteSpace, newValue: whiteSpace })
    }
    commitChangeBatch({ element: primary, htmlBefore, changes })

    for (const el of elements) {
      if (!(el instanceof HTMLElement)) continue
      if (textChanged) el.textContent = nextText
      if (whiteSpace !== null) el.style.whiteSpace = whiteSpace
    }
  }

  const disabled = shared === 'multiple'

  return (
    <Section title="Content">
      <Row label="Text">
        <label
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            padding: '6px 8px',
            background: COLORS.input,
            borderRadius: 4,
            color: COLORS.text,
            fontSize: 12,
            cursor: 'text',
          }}
        >
          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setShared('single') }}
            onBlur={() => {
              // Escape-triggered blur: discard the edit, restore the field.
              if (revertingRef.current) {
                revertingRef.current = false
                setText(elements[0]?.textContent ?? '')
                return
              }
              commit(text, multiline)
            }}
            onKeyDown={e => {
              // Single-line mode: Enter commits and blurs instead of inserting
              // a newline. Multiline mode lets the textarea handle Enter.
              if (e.key === 'Enter' && !multiline) {
                e.preventDefault()
                commit(text, multiline)
                e.currentTarget.blur()
                return
              }
              // Escape reverts to the original text and focuses out without
              // committing. stopPropagation so it doesn't also clear the
              // canvas selection (the global Escape shortcut).
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                revertingRef.current = true
                e.currentTarget.blur()
              }
            }}
            placeholder={disabled ? MULTIPLE_PLACEHOLDER : ''}
            disabled={disabled}
            rows={multiline ? 3 : 2}
            aria-label="Text content"
            style={{
              flex: 1,
              minWidth: 0,
              resize: 'vertical',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: COLORS.text,
              fontSize: 12,
              lineHeight: 1.4,
              padding: 0,
              fontFamily: 'inherit',
            }}
          />
        </label>
      </Row>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          color: COLORS.label,
          cursor: disabled ? 'default' : 'pointer',
          height: SIZES.rowGap + 16,
        }}
      >
        <input
          type="checkbox"
          checked={multiline}
          disabled={disabled}
          onChange={e => { setMultiline(e.target.checked); commit(text, e.target.checked) }}
          style={{ cursor: disabled ? 'default' : 'pointer', accentColor: COLORS.accent }}
        />
        Multiline
      </label>
    </Section>
  )
}
