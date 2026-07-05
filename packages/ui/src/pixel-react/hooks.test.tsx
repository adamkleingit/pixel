import { afterEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { createElement } from 'react'
import { useEffect, useState } from './index'
import {
  __resetStore,
  getFrames,
  getMode,
  setMode,
  snapshot,
  type Frame,
} from './store'

afterEach(() => {
  __resetStore()
  document.body.innerHTML = ''
})

/**
 * A two-level tree so instance keying (structural path) is exercised: a parent
 * with its own state and two child instances of the same component.
 */
function Child({ label }: { label: string }) {
  const [n] = useState(0)
  return createElement('span', { className: `child-${label}` }, `${label}:${n}`)
}

function Parent() {
  const [count, setCount] = useState(0)
  // Effect runs in capture (bumps count once) but must NOT run while suppressed.
  useEffect(() => {
    setCount((c) => (c === 0 ? c : c)) // no-op body; presence is what we assert via mode
  }, [])
  return createElement(
    'div',
    { id: 'parent', 'data-count': count },
    createElement(Child, { label: 'a' }),
    createElement(Child, { label: 'b' }),
    createElement('button', { onClick: () => setCount((c) => c + 1) }, 'inc'),
  )
}

describe('pixel-react hooks — capture', () => {
  it('records each instance under a distinct structural key', () => {
    render(createElement(Parent))
    const frame = snapshot()
    expect(frame).not.toBeNull()
    const keys = [...frame!.data.keys()]
    // Parent + two distinct Child instances.
    expect(keys.some((k) => k.includes('Parent'))).toBe(true)
    const childKeys = keys.filter((k) => k.includes('Child'))
    expect(new Set(childKeys).size).toBe(2)
  })

  it('captures state changes as the app updates', () => {
    const { container } = render(createElement(Parent))
    snapshot() // frame 0: count = 0
    const button = container.querySelector('button')!
    act(() => button.click())
    act(() => button.click())
    snapshot() // latest: count = 2
    expect(container.querySelector('#parent')!.getAttribute('data-count')).toBe('2')
    const frames = getFrames()
    const parentKey = [...frames[frames.length - 1].data.keys()].find((k) => k.includes('Parent'))!
    expect(frames[0].data.get(parentKey)?.state[0]).toBe(0)
    expect(frames[frames.length - 1].data.get(parentKey)?.state[0]).toBe(2)
  })
})

describe('pixel-react hooks — suppress (freeze)', () => {
  it('injects a captured frame on a fresh mount, ignoring later live state', () => {
    // Capture frame 0 (count 0), then advance live to 2.
    const first = render(createElement(Parent))
    const frame0: Frame = snapshot()!
    const button = first.container.querySelector('button')!
    act(() => button.click())
    act(() => button.click())
    first.unmount()

    // Freeze to frame 0: a fresh mount must render count = 0 again.
    setMode('suppress', frame0)
    const frozen = render(createElement(Parent))
    expect(frozen.container.querySelector('#parent')!.getAttribute('data-count')).toBe('0')

    // Clicking does not change the frozen view (injected value wins).
    const frozenBtn = frozen.container.querySelector('button')!
    act(() => frozenBtn.click())
    expect(frozen.container.querySelector('#parent')!.getAttribute('data-count')).toBe('0')
  })
})

describe('pixel-react hooks — restore', () => {
  it('seeds injected values as initial state, then is interactive again', () => {
    render(createElement(Parent))
    // Simulate a captured "pre-freeze" frame with count = 5.
    const parentKey0 = [...snapshot()!.data.keys()].find((k) => k.includes('Parent'))!
    const restoreFrame: Frame = {
      id: 99,
      at: Date.now(),
      data: new Map([[parentKey0, { state: [5], refs: [], contexts: [], stores: [] }]]),
    }
    document.body.innerHTML = ''

    setMode('restore', restoreFrame)
    const restored = render(createElement(Parent))
    expect(restored.container.querySelector('#parent')!.getAttribute('data-count')).toBe('5')

    // In a real app, PixelStateRoot flips the mode back to capture post-mount.
    setMode('capture', null)
    expect(getMode()).toBe('capture')
    const btn = restored.container.querySelector('button')!
    act(() => btn.click())
    expect(restored.container.querySelector('#parent')!.getAttribute('data-count')).toBe('6')
  })
})
