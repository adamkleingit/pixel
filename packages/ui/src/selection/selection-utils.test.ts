import { afterEach, describe, expect, it } from 'vitest'
import {
  ancestorAtDepth,
  computeDrillTarget,
  computeHoverTarget,
  depthOf,
  pointerElement,
} from './selection-utils'

/** A small nested tree under an explicit root, mirroring Pixel's util tests. */
function build() {
  const root = document.createElement('div')
  root.innerHTML = `<section><div class="card"><button>x</button></div></section>`
  document.body.appendChild(root)
  return {
    root,
    section: root.querySelector('section')!,
    card: root.querySelector('.card')!,
    button: root.querySelector('button')!,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('selection-utils — depth math', () => {
  it('depthOf counts element ancestors up to (not including) the root', () => {
    const { root, section, card, button } = build()
    expect(depthOf(section, root)).toBe(0)
    expect(depthOf(card, root)).toBe(1)
    expect(depthOf(button, root)).toBe(2)
    expect(depthOf(document.createElement('div'), root)).toBe(-1) // not inside
  })

  it('ancestorAtDepth walks up to a target depth, capped at the element', () => {
    const { root, section, card, button } = build()
    expect(ancestorAtDepth(button, root, 0)).toBe(section)
    expect(ancestorAtDepth(button, root, 1)).toBe(card)
    expect(ancestorAtDepth(button, root, 2)).toBe(button)
    expect(ancestorAtDepth(button, root, 9)).toBe(button) // shallower → capped
  })
})

describe('selection-utils — hover & drill targets', () => {
  it('hover with no selection anchors at depth 0 (outermost)', () => {
    const { root, section, button } = build()
    expect(computeHoverTarget(button, root, null)).toBe(section)
  })

  it('hover anchors to the current selection depth', () => {
    const { root, card, button } = build()
    // Selection at depth 1 (card) → hovering the button highlights its depth-1
    // ancestor, i.e. the card.
    expect(computeHoverTarget(button, root, card)).toBe(card)
  })

  it('double-click drills one level deeper than the selection (outside → inside)', () => {
    const { root, section, card, button } = build()
    expect(computeDrillTarget(button, root, null)).toBe(section) // none → depth 0
    expect(computeDrillTarget(button, root, section)).toBe(card) // depth 0 → 1
    expect(computeDrillTarget(button, root, card)).toBe(button) // depth 1 → 2
  })
})

describe('selection-utils — pointerElement', () => {
  it('returns the first composed-path element inside the root', () => {
    const { root, button } = build()
    const fake = { composedPath: () => [button, root, document.body, document, window] }
    expect(pointerElement(fake, root)).toBe(button)
  })
  it('returns null when nothing in the path is inside the root', () => {
    const { root } = build()
    const outside = document.createElement('div')
    const fake = { composedPath: () => [outside, document.body, window] }
    expect(pointerElement(fake, root)).toBeNull()
  })
})
