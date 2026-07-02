/**
 * Multi-edit undo — a single undo must revert the change on EVERY selected
 * element, not just the first. Covers both commit paths:
 *  - sidebar fan-out (`applyPatchAll` → debounced reporter → history)
 *  - drag gestures (`commitChangeBatch` with peers)
 *
 * Regression guard for the bug where peers were silenced / dropped from the
 * committed entry, so undo only reverted one element.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditHistoryProvider, useEditHistory } from './edit-history'
import { applyPatchAll } from './patch'
import { commitChangeBatch, flushOpenSessions, setReporterCommit } from './change-reporter'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EditHistoryProvider>{children}</EditHistoryProvider>
)

function el(): HTMLElement {
  const e = document.createElement('div')
  document.body.appendChild(e)
  return e
}

afterEach(() => {
  flushOpenSessions()
  setReporterCommit(null)
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('multi-edit undo', () => {
  it('sidebar fan-out: one undo reverts every selected element', () => {
    vi.useFakeTimers()
    const a = el()
    const b = el()
    const c = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() => {
      applyPatchAll([a, b, c], { kind: 'setStyle', property: 'color', value: 'red' })
      vi.runAllTimers() // flush the debounced reporter
    })

    expect(a.style.color).toBe('red')
    expect(b.style.color).toBe('red')
    expect(c.style.color).toBe('red')
    // One atomic entry holding all three peers' changes.
    expect(result.current.batch).toHaveLength(1)
    expect(result.current.batch[0].changes).toHaveLength(3)

    act(() => result.current.undo())
    expect(a.style.color).toBe('')
    expect(b.style.color).toBe('')
    expect(c.style.color).toBe('')

    act(() => result.current.redo())
    expect(a.style.color).toBe('red')
    expect(c.style.color).toBe('red')
  })

  it('distinct properties in one gesture stay separate undo entries', () => {
    vi.useFakeTimers()
    const a = el()
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() => {
      applyPatchAll([a], { kind: 'setStyle', property: 'color', value: 'red' })
      applyPatchAll([a], { kind: 'setStyle', property: 'opacity', value: '0.5' })
      vi.runAllTimers()
    })

    // Grouping is per-property, so single-element granularity is preserved.
    expect(result.current.batch).toHaveLength(2)
  })

  it('drag fan-out: commitChangeBatch folds peers into one entry', () => {
    const a = el()
    const b = el()
    // Pre-drag values; the drag already applied the new inline value to both.
    a.style.setProperty('padding-left', '16px')
    b.style.setProperty('padding-left', '16px')
    const { result } = renderHook(() => useEditHistory(), { wrapper })

    act(() => {
      commitChangeBatch({
        element: a,
        htmlBefore: '',
        changes: [{ property: 'padding-left', previousValue: '0px', newValue: '16px' }],
        peers: [b],
        peerBefore: () => '0px', // b's pre-drag inline value
      })
    })

    expect(result.current.batch[0].changes).toHaveLength(2)

    act(() => result.current.undo())
    expect(a.style.getPropertyValue('padding-left')).toBe('0px')
    expect(b.style.getPropertyValue('padding-left')).toBe('0px')
  })
})
