/**
 * Token `source` threading — guards the write-back path that lets the agent
 * write the symbolic spelling (var(--x) / bg-primary) instead of the resolved
 * value. The producers (design-pane `applyTokenAll`, drag `finalizeCommit`)
 * already attach a `source` to the patch/Change; these tests pin that the
 * carrier (reporter → history → payload) preserves it through to Save.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { EditHistoryProvider, useEditHistory } from './edit-history'
import { applyPatch } from './patch'
import { commitChangeBatch, setReporterCommit, flushOpenSessions } from './change-reporter'
import { buildEditPayload } from './edit-payload'
import type { TokenSource } from '../pixel-common'

const SRC: TokenSource = {
  tokenId: 'shadcn:globals.css:--primary',
  tokenName: 'primary',
  usage: { kind: 'utility', className: 'bg-primary' },
  resolvedValue: 'rgb(79, 70, 229)',
}

function el(): HTMLElement {
  const e = document.createElement('div')
  document.body.appendChild(e)
  return e
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

describe('token source threading', () => {
  it('design-pane patch path: reportPatch → commit carries source into the batch + payload', () => {
    vi.useFakeTimers()
    const target = el()
    const { result } = renderHook(() => useEditHistory(), {
      wrapper: ({ children }) => <EditHistoryProvider>{children}</EditHistoryProvider>,
    })

    // applyTokenAll fans a setStyle patch carrying the token source; the reporter
    // pre-hook is registered by the provider effect.
    act(() => {
      applyPatch(target, {
        kind: 'setStyle',
        property: 'background-color',
        value: SRC.resolvedValue,
        source: SRC,
      })
      vi.runAllTimers() // flush the debounced reporter session
    })

    expect(result.current.batch).toHaveLength(1)
    expect(result.current.batch[0].changes[0].source).toEqual(SRC)

    const payload = buildEditPayload(result.current.batch)
    expect(payload.changes[0]).toMatchObject({ name: 'background-color', after: SRC.resolvedValue, source: SRC })
  })

  it('drag path: commitChangeBatch carries source into the batch + payload', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), {
      wrapper: ({ children }) => <EditHistoryProvider>{children}</EditHistoryProvider>,
    })

    act(() => {
      commitChangeBatch({
        element: target,
        htmlBefore: '',
        changes: [{ property: 'padding-left', previousValue: '0px', newValue: '16px', source: SRC }],
      })
    })

    expect(result.current.batch[0].changes[0].source).toEqual(SRC)
    const payload = buildEditPayload(result.current.batch)
    expect(payload.changes[0]).toMatchObject({ name: 'padding-left', after: '16px', source: SRC })
  })

  it('a later raw edit in the same gesture clears an earlier token binding (last write wins)', () => {
    vi.useFakeTimers()
    const target = el()
    const { result } = renderHook(() => useEditHistory(), {
      wrapper: ({ children }) => <EditHistoryProvider>{children}</EditHistoryProvider>,
    })

    act(() => {
      applyPatch(target, { kind: 'setStyle', property: 'border-radius', value: '8px', source: SRC })
      applyPatch(target, { kind: 'setStyle', property: 'border-radius', value: '12px' }) // raw, no token
      vi.runAllTimers()
    })

    expect(result.current.batch[0].changes[0].after).toBe('12px')
    expect(result.current.batch[0].changes[0].source).toBeUndefined()
  })

  it('a raw edit carries no source', () => {
    const target = el()
    const { result } = renderHook(() => useEditHistory(), {
      wrapper: ({ children }) => <EditHistoryProvider>{children}</EditHistoryProvider>,
    })
    act(() => {
      commitChangeBatch({
        element: target,
        htmlBefore: '',
        changes: [{ property: 'width', previousValue: '', newValue: '100px' }],
      })
    })
    expect(result.current.batch[0].changes[0].source).toBeUndefined()
    expect(buildEditPayload(result.current.batch).changes[0].source).toBeUndefined()
  })

  afterEach(() => {
    // The provider effect clears the reporter commit on unmount; make sure no
    // pending session leaks into the next test if fake timers were used.
    flushOpenSessions()
    setReporterCommit(null)
  })
})
