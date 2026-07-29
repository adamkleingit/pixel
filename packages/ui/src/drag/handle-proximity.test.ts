import { describe, expect, it } from 'vitest'
import type { HandleLayout } from './handle-layout'
import {
  buildHandleCandidates,
  distanceToLocalRect,
  localToScreen,
  pickClosestHandle,
  radiusId,
  resizeCornerId,
  resizeEdgeId,
  rotateId,
  paddingId,
  marginId,
} from './handle-proximity'

const FULL_LAYOUT: HandleLayout = {
  edges: ['top', 'right', 'bottom', 'left'],
  corners: ['tl', 'tr', 'br', 'bl'],
}

const TINY = { top: 100, left: 100, width: 24, height: 24, rotation: 0 }

describe('localToScreen / distanceToLocalRect', () => {
  it('maps the unrotated corner to screen', () => {
    const p = localToScreen({ x: 0, y: 0 }, TINY)
    expect(p.x).toBeCloseTo(100)
    expect(p.y).toBeCloseTo(100)
  })

  it('rotates 90° about centre', () => {
    const rect = { ...TINY, width: 40, height: 20, rotation: 90 }
    // Local top-left (0,0) → after 90° CW around centre: screen ≈ (left+W/2+H/2, top+H/2-W/2)
    const p = localToScreen({ x: 0, y: 0 }, rect)
    expect(p.x).toBeCloseTo(100 + 20 + 10)
    expect(p.y).toBeCloseTo(100 + 10 - 20)
  })

  it('reports 0 distance when pointer is inside the hit rect', () => {
    const hit = { left: 0, top: 0, width: 8, height: 8 }
    expect(distanceToLocalRect({ x: 102, y: 102 }, hit, TINY)).toBe(0)
  })
})

describe('pickClosestHandle on a tiny box', () => {
  const candidates = buildHandleCandidates({
    rect: TINY,
    layout: FULL_LAYOUT,
    chromeRevealed: true,
    radii: { tl: 0, tr: 0, br: 0, bl: 0 },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    scale: 1,
  })

  it('prefers resize corner over rotate when the pointer is on the corner square', () => {
    // BR corner centre in screen space
    const pointer = { x: 100 + 24, y: 100 + 24 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(resizeCornerId('br'))
  })

  it('prefers radius when the pointer is on the inset radius hit', () => {
    // BR radius at inset 8 from corner → local (24-8, 24-8) = (16,16) → screen (116,116)
    const pointer = { x: 116, y: 116 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(radiusId('br'))
  })

  it('prefers rotate when outside the resize square but inside the rotate band', () => {
    // TL rotate band extends 11px outside; point northwest of corner outside 8×8
    const pointer = { x: 100 - 8, y: 100 - 8 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(rotateId('tl'))
  })

  it('prefers padding over the edge band when closer to the padding bar', () => {
    // Top padding bar at y = MIN_OFFSET (3); edge band covers y 0..10
    const pointer = { x: 100 + 12, y: 100 + 3 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(paddingId('top'))
  })

  it('prefers the edge band at the very outer edge over padding', () => {
    const pointer = { x: 100 + 12, y: 100 + 0.5 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(resizeEdgeId('top'))
  })

  it('prefers margin when outside the box near the margin bar', () => {
    const pointer = { x: 100 + 12, y: 100 - 3 }
    expect(pickClosestHandle(candidates, pointer, TINY)).toBe(marginId('top'))
  })

  it('returns null when the pointer is far away', () => {
    expect(pickClosestHandle(candidates, { x: 0, y: 0 }, TINY)).toBeNull()
  })

  it('applies hysteresis so the current winner sticks until clearly beaten', () => {
    const onCorner = { x: 124, y: 124 }
    const first = pickClosestHandle(candidates, onCorner, TINY)
    expect(first).toBe(resizeCornerId('br'))
    // Nudge slightly toward the radius dot but stay within hysteresis of the corner
    const nudged = { x: 122, y: 122 }
    expect(
      pickClosestHandle(candidates, nudged, TINY, { currentId: first, hysteresisPx: 4 }),
    ).toBe(resizeCornerId('br'))
  })
})

describe('buildHandleCandidates rotation gating', () => {
  it('omits radius/spacing when rotated', () => {
    const c = buildHandleCandidates({
      rect: { ...TINY, rotation: 15 },
      layout: FULL_LAYOUT,
      chromeRevealed: true,
      radii: { tl: 4, tr: 4, br: 4, bl: 4 },
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      margin: { top: 4, right: 4, bottom: 4, left: 4 },
    })
    expect(c.some(x => x.kind === 'radius')).toBe(false)
    expect(c.some(x => x.kind === 'padding')).toBe(false)
    expect(c.some(x => x.kind === 'rotate')).toBe(true)
    expect(c.some(x => x.kind === 'resize-corner')).toBe(true)
  })

  it('omits chrome when not revealed', () => {
    const c = buildHandleCandidates({
      rect: TINY,
      layout: FULL_LAYOUT,
      chromeRevealed: false,
    })
    expect(c.some(x => x.kind === 'radius')).toBe(false)
    expect(c.some(x => x.kind === 'padding')).toBe(false)
  })
})
