import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { describeElementChain } from '../capture/hittest'
import { eventInOwnUI } from '../own-ui'
import type { CommentRecord, ElementInfo } from '../types'

export interface CommentDraft {
  id: string
  x: number
  y: number
  body: string
  target: ElementInfo[]
}

let nextId = 1

export function draftsToPayload(drafts: CommentDraft[]): CommentRecord[] {
  return drafts
    .filter((d) => d.body.trim().length > 0)
    .map(({ target, body, x, y }) => ({ target, body: body.trim(), x, y }))
}

/**
 * Comment-mode surface: click the page to drop a pin + composer; edit or delete
 * existing pins. Owns the draft list; parent reads it via `onChange` / imperative
 * clear through `draftsRef`.
 */
export function CommentLayer({
  drafts,
  onChange,
  active,
}: {
  drafts: CommentDraft[]
  onChange: (next: CommentDraft[]) => void
  /** When false, don't capture page clicks (e.g. mouse-tool passthrough). */
  active: boolean
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts

  // Mark the document so CSS can switch the cursor to the comment tool.
  useEffect(() => {
    document.documentElement.classList.add('pixel-commenting')
    return () => document.documentElement.classList.remove('pixel-commenting')
  }, [])

  // Place a new pin on page click (capture phase); ignore Pixel chrome.
  useEffect(() => {
    if (!active) return
    const onClick = (e: MouseEvent) => {
      if (eventInOwnUI(e)) return
      e.preventDefault()
      e.stopPropagation()
      const target = describeElementChain(e.clientX, e.clientY)
      const id = `c${nextId++}`
      const draft: CommentDraft = { id, x: e.clientX, y: e.clientY, body: '', target }
      onChange([...draftsRef.current, draft])
      setOpenId(id)
    }
    // Capture click after the provider's swallow has blocked activation — we
    // listen on bubble of a dedicated capture we install ourselves at the end.
    window.addEventListener('click', onClick, true)
    return () => window.removeEventListener('click', onClick, true)
  }, [active, onChange])

  const updateBody = useCallback(
    (id: string, body: string) => {
      onChange(draftsRef.current.map((d) => (d.id === id ? { ...d, body } : d)))
    },
    [onChange],
  )

  const remove = useCallback(
    (id: string) => {
      onChange(draftsRef.current.filter((d) => d.id !== id))
      setOpenId((cur) => (cur === id ? null : cur))
    },
    [onChange],
  )

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className="pixel-comments" data-pixel-ui="">
      {drafts.map((d, i) => (
        <CommentPin
          key={d.id}
          draft={d}
          index={i + 1}
          open={openId === d.id}
          onOpen={() => setOpenId(d.id)}
          onClose={() => setOpenId((cur) => (cur === d.id ? null : cur))}
          onChangeBody={(body) => updateBody(d.id, body)}
          onDelete={() => remove(d.id)}
        />
      ))}
    </div>,
    document.body,
  )
}

function CommentPin({
  draft,
  index,
  open,
  onOpen,
  onClose,
  onChangeBody,
  onDelete,
}: {
  draft: CommentDraft
  index: number
  open: boolean
  onOpen: () => void
  onClose: () => void
  onChangeBody: (body: string) => void
  onDelete: () => void
}) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (open) areaRef.current?.focus()
  }, [open])

  // Keep the composer on-screen: prefer below-right of the pin; flip if clipped.
  const left = Math.min(draft.x + 14, typeof window !== 'undefined' ? window.innerWidth - 280 : draft.x)
  const top = Math.min(draft.y + 14, typeof window !== 'undefined' ? window.innerHeight - 160 : draft.y)

  return (
    <>
      <button
        type="button"
        className={`pixel-comment-pin${open ? ' open' : ''}${draft.body.trim() ? ' filled' : ''}`}
        style={{ left: draft.x, top: draft.y }}
        title={draft.body.trim() || 'Empty comment'}
        aria-label={`Comment ${index}`}
        onClick={(e) => {
          e.stopPropagation()
          onOpen()
        }}
      >
        {index}
      </button>
      {open && (
        <div
          className="pixel-comment-composer"
          style={{ left, top }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={areaRef}
            className="pixel-comment-input"
            placeholder="Leave a comment…"
            value={draft.body}
            rows={3}
            onChange={(e) => onChangeBody(e.target.value)}
          />
          <p className="pixel-comment-hint">Stays pinned — Save in the bar sends every pin as one batch.</p>
          <div className="pixel-comment-composer-actions">
            <button type="button" className="pixel-comment-btn danger" onClick={onDelete}>
              Delete
            </button>
            <button type="button" className="pixel-comment-btn secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  )
}
