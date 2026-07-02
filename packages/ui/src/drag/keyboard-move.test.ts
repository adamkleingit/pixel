import { afterEach, describe, expect, it } from 'vitest'
import { computeKeyboardMove, isArrowKey } from './keyboard-move'

/** Replays edit-history's `applyValue('move')` so reorder tests can assert the
 *  resulting DOM order end-to-end (insert target before the excluding-target
 *  sibling at `index`, or append). Kept in lockstep with edit-history.tsx. */
function applyMove(target: Element, index: number): void {
  const parent = target.parentElement!
  const siblings = Array.from(parent.children).filter((c) => c !== target)
  parent.insertBefore(target, siblings[index] ?? null)
}

const ids = (parent: Element) => Array.from(parent.children).map((c) => c.id)

afterEach(() => {
  document.body.innerHTML = ''
})

describe('isArrowKey', () => {
  it('recognizes the four arrows and nothing else', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      expect(isArrowKey(k)).toBe(true)
    }
    for (const k of ['Escape', 'Enter', 'a', 'Shift']) expect(isArrowKey(k)).toBe(false)
  })
})

describe('computeKeyboardMove — non-arrow / no parent', () => {
  it('returns null for a non-arrow key', () => {
    const el = document.createElement('div')
    document.body.append(el)
    expect(computeKeyboardMove(el, 'Enter', false)).toBeNull()
  })

  it('returns null for an element without a parent', () => {
    const el = document.createElement('div')
    expect(computeKeyboardMove(el, 'ArrowLeft', false)).toBeNull()
  })
})

describe('computeKeyboardMove — absolute nudge', () => {
  function absEl(offsetLeft = 0, offsetTop = 0) {
    const el = document.createElement('div')
    el.style.position = 'absolute'
    Object.defineProperty(el, 'offsetLeft', { value: offsetLeft, configurable: true })
    Object.defineProperty(el, 'offsetTop', { value: offsetTop, configurable: true })
    document.body.append(el)
    return el
  }

  it('nudges left/right on the `left` axis and up/down on `top` by 1px', () => {
    const el = absEl(50, 80)
    expect(computeKeyboardMove(el, 'ArrowRight', false)).toEqual({
      changes: [{ target: el, kind: 'style', name: 'left', before: '', after: '51px' }],
      label: 'left',
    })
    expect(computeKeyboardMove(el, 'ArrowLeft', false)?.changes[0]).toMatchObject({ name: 'left', after: '49px' })
    expect(computeKeyboardMove(el, 'ArrowDown', false)?.changes[0]).toMatchObject({ name: 'top', after: '81px' })
    expect(computeKeyboardMove(el, 'ArrowUp', false)?.changes[0]).toMatchObject({ name: 'top', after: '79px' })
  })

  it('Shift jumps by 10px', () => {
    const el = absEl(50, 80)
    expect(computeKeyboardMove(el, 'ArrowRight', true)?.changes[0]).toMatchObject({ after: '60px' })
    expect(computeKeyboardMove(el, 'ArrowUp', true)?.changes[0]).toMatchObject({ name: 'top', after: '70px' })
  })

  it('captures the existing inline value as `before` (so undo restores it)', () => {
    const el = absEl(50)
    el.style.left = '50px'
    expect(computeKeyboardMove(el, 'ArrowRight', false)?.changes[0]).toMatchObject({
      before: '50px',
      after: '51px',
    })
  })
})

describe('computeKeyboardMove — in-flow reorder', () => {
  function row(n: number) {
    const parent = document.createElement('div')
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div')
      c.id = `c${i}`
      parent.append(c)
    }
    document.body.append(parent)
    return parent
  }

  it('ArrowDown/ArrowRight move one slot later; the move applies to the right order', () => {
    const parent = row(4) // c0 c1 c2 c3
    const target = parent.children[1] // c1
    const res = computeKeyboardMove(target as HTMLElement, 'ArrowDown', false)!
    expect(res.changes[0]).toMatchObject({ kind: 'move', name: '' })
    applyMove(target, Number(res.changes[0].after))
    expect(ids(parent)).toEqual(['c0', 'c2', 'c1', 'c3'])
  })

  it('ArrowUp/ArrowLeft move one slot earlier', () => {
    const parent = row(4)
    const target = parent.children[2] // c2
    const res = computeKeyboardMove(target as HTMLElement, 'ArrowLeft', false)!
    applyMove(target, Number(res.changes[0].after))
    expect(ids(parent)).toEqual(['c0', 'c2', 'c1', 'c3'])
  })

  it('Shift jumps to the last / first slot', () => {
    const parent = row(4) // c0 c1 c2 c3
    const c0 = document.getElementById('c0')!
    const down = computeKeyboardMove(c0 as HTMLElement, 'ArrowDown', true)!
    applyMove(c0, Number(down.changes[0].after))
    expect(ids(parent)).toEqual(['c1', 'c2', 'c3', 'c0']) // jumped to last

    const c3 = document.getElementById('c3')! // currently at index 2
    const up = computeKeyboardMove(c3 as HTMLElement, 'ArrowUp', true)!
    applyMove(c3, Number(up.changes[0].after))
    expect(ids(parent)).toEqual(['c3', 'c1', 'c2', 'c0']) // jumped to first
  })

  it('returns null at the boundary (first element up, last element down)', () => {
    const parent = row(3)
    expect(computeKeyboardMove(parent.children[0] as HTMLElement, 'ArrowUp', false)).toBeNull()
    expect(computeKeyboardMove(parent.children[2] as HTMLElement, 'ArrowDown', false)).toBeNull()
    // Shift-jump while already at the boundary is also a no-op.
    expect(computeKeyboardMove(parent.children[0] as HTMLElement, 'ArrowUp', true)).toBeNull()
  })

  it('counts only flow children — an absolute sibling does not take a slot', () => {
    const parent = row(3) // c0 c1 c2
    ;(parent.children[1] as HTMLElement).style.position = 'absolute' // c1 out of flow
    const target = parent.children[0] // c0; flow order is [c0, c2]
    const res = computeKeyboardMove(target as HTMLElement, 'ArrowDown', false)!
    applyMove(target, Number(res.changes[0].after))
    // c0 steps past c2 (the only other flow child); the absolute c1 stays put.
    expect(ids(parent)).toEqual(['c1', 'c2', 'c0'])
  })
})
