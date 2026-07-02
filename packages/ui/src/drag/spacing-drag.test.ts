/**
 * Spacing-drag: dragging the gap of a container whose justify-content is a
 * spread mode cycles the spread modes (space-evenly → -around → -between) along
 * the axis; ⌘/Ctrl converts it to an explicit px gap. (Design-pane parity, but
 * for the on-canvas gap handle.)
 */
import { afterEach, describe, expect, it } from 'vitest'
import { isSpacingDragging, startSpacingDrag } from './spacing-drag'

function flexRow(justify: string): HTMLElement {
  const el = document.createElement('div')
  el.style.display = 'flex'
  el.style.justifyContent = justify
  el.style.columnGap = '16px'
  el.append(document.createElement('button'), document.createElement('button'))
  document.body.appendChild(el)
  return el
}

function move(clientX: number, opts: { meta?: boolean } = {}): void {
  document.dispatchEvent(
    new PointerEvent('pointermove', { clientX, clientY: 0, metaKey: opts.meta ?? false, bubbles: true }),
  )
}
function up(): void {
  document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
}

afterEach(() => {
  if (isSpacingDragging()) up()
  document.body.innerHTML = ''
})

describe('spacing-drag — gap on a spread container', () => {
  it('plain drag cycles the spread modes along the axis', () => {
    const el = flexRow('space-between')
    // Guard: jsdom must resolve justify-content for the spread path to engage.
    expect(getComputedStyle(el).justifyContent).toBe('space-between')

    startSpacingDrag({ element: el, property: 'column-gap', axis: 'x', sign: 1, startX: 200, startY: 0, cursor: 'ew-resize' })

    move(120) // ~80px left → past 2 steps → least spread
    expect(el.style.justifyContent).toBe('space-evenly')

    move(280) // ~80px right → most spread
    expect(el.style.justifyContent).toBe('space-between')

    up()
  })

  it('⌘-drag converts the spread gap to an explicit px gap (flex-start + column-gap)', () => {
    const el = flexRow('space-between')
    startSpacingDrag({ element: el, property: 'column-gap', axis: 'x', sign: 1, startX: 200, startY: 0, cursor: 'ew-resize' })

    move(240, { meta: true }) // +40px with ⌘ → exit spread, set px gap
    expect(el.style.justifyContent).toBe('flex-start')
    expect(parseFloat(el.style.columnGap)).toBeGreaterThan(0)

    up()
  })

  it('a plain px gap (no spread) still scrubs pixels', () => {
    const el = flexRow('flex-start')
    startSpacingDrag({ element: el, property: 'column-gap', axis: 'x', sign: 1, startX: 200, startY: 0, cursor: 'ew-resize' })
    move(230) // +30px
    expect(el.style.justifyContent).toBe('flex-start') // unchanged
    expect(parseFloat(el.style.columnGap)).toBeGreaterThan(0)
    up()
  })
})
