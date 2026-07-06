import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginInlineEdit, isHtmlEditable, isInlineEditable, isTextEditable } from './inline-text-edit'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isTextEditable', () => {
  it('accepts text leaves, textual inputs, and textarea', () => {
    const p = document.createElement('p')
    p.textContent = 'hi'
    const input = document.createElement('input')
    const ta = document.createElement('textarea')
    expect(isTextEditable(p)).toBe(true)
    expect(isTextEditable(input)).toBe(true)
    expect(isTextEditable(ta)).toBe(true)
  })
  it('rejects containers with element children, and non-text controls', () => {
    const div = document.createElement('div')
    div.innerHTML = '<span>a</span><span>b</span>'
    const select = document.createElement('select')
    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    expect(isTextEditable(div)).toBe(false)
    expect(isTextEditable(select)).toBe(false)
    expect(isTextEditable(checkbox)).toBe(false)
  })
})

describe('isHtmlEditable / isInlineEditable', () => {
  it('accepts mixed text+element content, rejects leaves, pure containers, inputs', () => {
    const mixed = document.createElement('p')
    mixed.innerHTML = 'Press <span class="kbd">Space</span> now'
    const leaf = document.createElement('p')
    leaf.textContent = 'hi'
    const container = document.createElement('div')
    container.innerHTML = '<span>a</span><span>b</span>' // only elements, no loose text
    const input = document.createElement('input')

    expect(isHtmlEditable(mixed)).toBe(true)
    expect(isHtmlEditable(leaf)).toBe(false) // pure text → plaintext path
    expect(isHtmlEditable(container)).toBe(false) // no loose text → keeps drilling
    expect(isHtmlEditable(input)).toBe(false)

    // isInlineEditable is the union — both the leaf and the mixed element qualify.
    expect(isInlineEditable(leaf)).toBe(true)
    expect(isInlineEditable(mixed)).toBe(true)
    expect(isInlineEditable(container)).toBe(false)
  })
})

describe('beginInlineEdit (html / mixed content)', () => {
  it('shows innerHTML as editable text and commits it as an html change', () => {
    const p = document.createElement('p')
    p.innerHTML = 'Press <span class="kbd">Space</span>'
    document.body.appendChild(p)
    const commit = vi.fn()

    const session = beginInlineEdit(p, commit)!
    // Content swapped to the raw markup shown as text; the child span is gone
    // for the duration of the edit.
    expect(p.textContent).toBe('Press <span class="kbd">Space</span>')
    expect(p.querySelector('span')).toBeNull()
    expect(p.getAttribute('contenteditable')).toBe('plaintext-only')

    // Edit the raw markup and commit → re-parsed back into DOM.
    p.textContent = 'Hit <span class="kbd">Enter</span> instead'
    session.exit({ commit: true })

    expect(p.innerHTML).toBe('Hit <span class="kbd">Enter</span> instead')
    expect(p.querySelector('span.kbd')?.textContent).toBe('Enter')
    expect(commit).toHaveBeenCalledTimes(1)
    const [changes, label] = commit.mock.calls[0]
    expect(changes[0]).toMatchObject({
      target: p,
      kind: 'html',
      before: 'Press <span class="kbd">Space</span>',
      after: 'Hit <span class="kbd">Enter</span> instead',
    })
    expect(label).toBe('html')
    expect(p.hasAttribute('contenteditable')).toBe(false) // restored
  })

  it('cancel restores the original innerHTML and does not commit', () => {
    const p = document.createElement('p')
    p.innerHTML = 'A <b>B</b> C'
    document.body.appendChild(p)
    const commit = vi.fn()

    const session = beginInlineEdit(p, commit)!
    p.textContent = 'changed'
    session.exit({ commit: false })

    expect(p.innerHTML).toBe('A <b>B</b> C')
    expect(p.querySelector('b')?.textContent).toBe('B')
    expect(commit).not.toHaveBeenCalled()
  })

  it('an unchanged edit re-parses the DOM without committing', () => {
    const p = document.createElement('p')
    p.innerHTML = 'A <b>B</b> C'
    document.body.appendChild(p)
    const commit = vi.fn()

    const session = beginInlineEdit(p, commit)!
    session.exit({ commit: true }) // no edits

    expect(p.innerHTML).toBe('A <b>B</b> C')
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('beginInlineEdit (text)', () => {
  it('commits the new text on exit({commit:true})', () => {
    const p = document.createElement('p')
    p.textContent = 'before'
    document.body.appendChild(p)
    const commit = vi.fn()

    const session = beginInlineEdit(p, commit)!
    expect(session).not.toBeNull()
    expect(p.getAttribute('contenteditable')).toBe('plaintext-only')

    p.textContent = 'after'
    session.exit({ commit: true })

    expect(commit).toHaveBeenCalledTimes(1)
    const [changes, label] = commit.mock.calls[0]
    expect(changes[0]).toMatchObject({ target: p, kind: 'text', before: 'before', after: 'after' })
    expect(label).toBe('text')
    expect(p.hasAttribute('contenteditable')).toBe(false) // restored
  })

  it('discards and restores on exit({commit:false})', () => {
    const p = document.createElement('p')
    p.textContent = 'before'
    document.body.appendChild(p)
    const commit = vi.fn()
    const session = beginInlineEdit(p, commit)!
    p.textContent = 'edited'
    session.exit({ commit: false })
    expect(commit).not.toHaveBeenCalled()
    expect(p.textContent).toBe('before')
  })

  it('mirrors each keystroke onto peers live, before commit', () => {
    const anchor = document.createElement('p')
    anchor.textContent = 'orig'
    const peerA = document.createElement('p')
    peerA.textContent = 'orig'
    const peerB = document.createElement('span')
    peerB.textContent = 'orig'
    document.body.append(anchor, peerA, peerB)
    const commit = vi.fn()

    const session = beginInlineEdit(anchor, commit, [peerA, peerB])!
    // Simulate typing: text changes + the browser's `input` event on the anchor.
    anchor.textContent = 'liv'
    anchor.dispatchEvent(new InputEvent('input'))
    expect(peerA.textContent).toBe('liv') // updated LIVE, no commit yet
    expect(peerB.textContent).toBe('liv')
    expect(commit).not.toHaveBeenCalled()

    anchor.textContent = 'live'
    anchor.dispatchEvent(new InputEvent('input'))
    expect(peerA.textContent).toBe('live')

    session.exit({ commit: true })
    expect(commit).toHaveBeenCalledTimes(1)
    const [changes] = commit.mock.calls[0]
    expect(changes).toHaveLength(3) // anchor + 2 peers, one batch
    expect(changes).toContainEqual(
      expect.objectContaining({ target: peerA, kind: 'text', before: 'orig', after: 'live' }),
    )
  })

  it('reverts live-mirrored peers on cancel', () => {
    const anchor = document.createElement('p')
    anchor.textContent = 'orig'
    const peer = document.createElement('p')
    peer.textContent = 'orig'
    document.body.append(anchor, peer)
    const commit = vi.fn()

    const session = beginInlineEdit(anchor, commit, [peer])!
    anchor.textContent = 'typed'
    anchor.dispatchEvent(new InputEvent('input'))
    expect(peer.textContent).toBe('typed') // mirrored live

    session.exit({ commit: false })
    expect(commit).not.toHaveBeenCalled()
    expect(anchor.textContent).toBe('orig')
    expect(peer.textContent).toBe('orig') // reverted
  })
})
