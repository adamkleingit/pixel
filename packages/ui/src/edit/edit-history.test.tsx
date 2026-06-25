import { afterEach, describe, expect, it } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditHistoryProvider, useEditHistory, type Change } from './edit-history'

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
