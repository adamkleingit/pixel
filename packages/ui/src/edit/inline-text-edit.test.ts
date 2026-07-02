import { afterEach, describe, expect, it, vi } from 'vitest'
import { beginInlineEdit, isTextEditable } from './inline-text-edit'

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
})
