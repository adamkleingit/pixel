import { afterEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditHistoryProvider, useEditHistory, type Change } from './edit-history'
import { applyPatch } from './patch'
import { drainPendingChanges } from './change-reporter'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EditHistoryProvider>{children}</EditHistoryProvider>
)

function el(): HTMLElement {
  const e = document.createElement('div')
  document.body.appendChild(e)
  return e
}
const styleChange = (target: HTMLElement, name: string, before: string, after: string): Change => ({
  target,
  kind: 'style',
  name,
  before,
  after,
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('edit-history', () => {
  it('commits apply to the live DOM and undo/redo reverse them', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() => result.current.commit([styleChange(target, 'padding', '', '10px')], 'padding'))
    expect(target.style.padding).toBe('10px')
    expect(result.current.canUndo).toBe(true)
    expect(result.current.canRedo).toBe(false)

    act(() => result.current.undo())
    expect(target.style.padding).toBe('') // reverted to `before`
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(true)

    act(() => result.current.redo())
    expect(target.style.padding).toBe('10px')
  })

  it('applies a multi-change entry atomically (one undo reverts all)', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })
    act(() =>
      result.current.commit(
        [styleChange(target, 'width', '', '100px'), styleChange(target, 'height', '', '50px')],
        'resize',
      ),
    )
    expect(target.style.width).toBe('100px')
    expect(target.style.height).toBe('50px')
    act(() => result.current.undo())
    expect(target.style.width).toBe('')
    expect(target.style.height).toBe('')
  })

  it('a new commit after undo truncates the redo tail', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })
    act(() => result.current.commit([styleChange(target, 'color', '', 'red')]))
    act(() => result.current.commit([styleChange(target, 'color', 'red', 'blue')]))
    act(() => result.current.undo()) // back to red
    expect(target.style.color).toBe('red')
    act(() => result.current.commit([styleChange(target, 'color', 'red', 'green')])) // drops "blue"
    expect(result.current.canRedo).toBe(false)
    expect(result.current.batch.map((e) => e.changes[0].after)).toEqual(['red', 'green'])
  })

  it('skips no-op changes (before === after)', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })
    act(() => result.current.commit([styleChange(target, 'opacity', '1', '1')]))
    expect(result.current.canUndo).toBe(false)
    expect(result.current.batch).toHaveLength(0)
  })

  it('clear() resets undo/redo so saved edits cannot be undone in a later session', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() => result.current.commit([styleChange(target, 'padding', '', '10px')]))
    act(() => result.current.commit([styleChange(target, 'padding', '10px', '20px')]))
    act(() => result.current.undo()) // 20→10, leaving 20 redoable

    // Save → the batch went to the agent; history must reset.
    act(() => result.current.clear())
    expect(result.current.canUndo).toBe(false)
    expect(result.current.canRedo).toBe(false)
    expect(result.current.batch).toHaveLength(0)

    // The applied value stays in the DOM (the agent rewrites source); undo/redo
    // are now no-ops, so the sent edit can't be reverted.
    act(() => result.current.undo())
    act(() => result.current.redo())
    expect(target.style.padding).toBe('10px')
  })

  it('discard reverts an in-flight (debounced, not-yet-committed) pane edit too', () => {
    const target = el()
    target.style.padding = '5px' // a pre-existing inline value to revert back to
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    // A design-pane edit mutates the DOM immediately but its commit is debounced,
    // so right now it's a pending session — not yet a history entry.
    act(() => applyPatch(target, { kind: 'setStyle', property: 'padding', value: '20px' }))
    expect(target.style.padding).toBe('20px')
    expect(result.current.batch).toHaveLength(0)

    // Cancel must still undo it (this is the bug: discard used to revert only
    // committed entries, leaving the in-flight edit applied).
    act(() => result.current.discard())
    expect(target.style.padding).toBe('5px')
    expect(result.current.canUndo).toBe(false)
  })

  it('drainPendingChanges folds an in-flight edit into the Save batch', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })
    act(() => applyPatch(target, { kind: 'setStyle', property: 'gap', value: '8px' }))
    void result // provider mounted → reporter wired
    const drained = drainPendingChanges()
    expect(drained).toHaveLength(1)
    expect(drained[0]).toMatchObject({ kind: 'style', name: 'gap', after: '8px' })
  })

  it('remove change deletes the node; undo re-inserts it at its slot', () => {
    const parent = el()
    const a = document.createElement('span')
    const b = document.createElement('span')
    const c = document.createElement('span')
    parent.append(a, b, c)
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() =>
      result.current.commit(
        [{ target: b, kind: 'remove', name: '', before: '', after: '', parent, anchor: b.nextSibling }],
        'delete',
      ),
    )
    expect(Array.from(parent.children)).toEqual([a, c])

    act(() => result.current.undo()) // re-insert b before c
    expect(Array.from(parent.children)).toEqual([a, b, c])

    act(() => result.current.redo())
    expect(Array.from(parent.children)).toEqual([a, c])
  })

  it('insert change adds the node; undo removes it', () => {
    const parent = el()
    const a = document.createElement('span')
    parent.append(a)
    const clone = a.cloneNode(true) as HTMLElement
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() =>
      result.current.commit(
        [{ target: clone, kind: 'insert', name: '', before: '', after: '', parent, anchor: a.nextSibling }],
        'duplicate',
      ),
    )
    expect(Array.from(parent.children)).toEqual([a, clone])
    expect(result.current.canUndo).toBe(true)

    act(() => result.current.undo())
    expect(Array.from(parent.children)).toEqual([a])

    act(() => result.current.redo())
    expect(Array.from(parent.children)).toEqual([a, clone])
  })

  it('records text edits', () => {
    const target = el()
    target.textContent = 'old'
    const { result } = renderHook(() => useEditHistory(), { wrapper })
    act(() => result.current.commit([{ target, kind: 'text', name: '', before: 'old', after: 'new' }], 'text'))
    expect(target.textContent).toBe('new')
    act(() => result.current.undo())
    expect(target.textContent).toBe('old')
  })
})
