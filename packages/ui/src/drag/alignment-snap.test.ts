import { describe, expect, it } from 'vitest'
import { computeSnap, SNAP_THRESHOLD, type SnapModel, type SnapRect } from './alignment-snap'

/** A model with one candidate rect's edges/centers (screen px). */
function modelFrom(r: SnapRect): SnapModel {
  const cx = (r.left + r.right) / 2
  const cy = (r.top + r.bottom) / 2
  return {
    vlines: [r.left, cx, r.right].map((x) => ({ x, top: r.top, bottom: r.bottom })),
    hlines: [r.top, cy, r.bottom].map((y) => ({ y, left: r.left, right: r.right })),
  }
}

const CAND: SnapRect = { left: 100, top: 100, right: 200, bottom: 200 } // 100×100 at (100,100)

describe('computeSnap — move (all edges probe)', () => {
  it('snaps a left edge onto a candidate left within threshold', () => {
    // Moving rect's left is 2px off the candidate's left (100) → snaps.
    const moving: SnapRect = { left: 102, top: 300, right: 152, bottom: 350 }
    const res = computeSnap(moving, modelFrom(CAND))
    expect(res.dx).toBe(-2) // pull left 2px to hit x=100
    expect(res.dy).toBe(0)
    const g = res.guides.find((g) => g.axis === 'x')!
    expect(g.position).toBe(100)
    // Guide spans both rects vertically: min top (100) … max bottom (350).
    expect(g.start).toBe(100)
    expect(g.end).toBe(350)
  })

  it('snaps center-x to the candidate center', () => {
    // Candidate center-x = 150. Moving center-x = 151 (left 126,right 176).
    const moving: SnapRect = { left: 126, top: 300, right: 176, bottom: 350 }
    const res = computeSnap(moving, modelFrom(CAND))
    expect(res.dx).toBe(-1) // center 151 → 150
  })

  it('snaps both axes independently (corner alignment)', () => {
    // left 101→100 (dx -1), top 98→100 (dy +2).
    const moving: SnapRect = { left: 101, top: 98, right: 141, bottom: 138 }
    const res = computeSnap(moving, modelFrom(CAND))
    expect(res.dx).toBe(-1)
    expect(res.dy).toBe(2)
    expect(res.guides.map((g) => g.axis).sort()).toEqual(['x', 'y'])
  })

  it('does not snap beyond the threshold', () => {
    // Every edge/center is >SNAP_THRESHOLD from any candidate line (104/129/154
    // vs 100/150/200 on x; 300/325/350 vs 100/150/200 on y).
    const moving: SnapRect = { left: 104, top: 300, right: 154, bottom: 350 }
    const res = computeSnap(moving, modelFrom(CAND))
    expect(res.dx).toBe(0)
    expect(res.dy).toBe(0)
    expect(res.guides).toHaveLength(0)
  })

  it('picks the nearest candidate line when several are in range', () => {
    // right edge at 199: candidate right (200) is 1px away, center (150) far.
    const moving: SnapRect = { left: 149, top: 300, right: 199, bottom: 350 }
    const res = computeSnap(moving, modelFrom(CAND))
    expect(res.dx).toBe(1) // 199 → 200 (right/right), not 149→150
  })
})

describe('computeSnap — resize (single-edge probe)', () => {
  it('snaps only the probed edge, ignoring the fixed one', () => {
    // Resizing the right edge (at 203) toward the candidate right (200): only
    // xs=[203] is probed, so the left edge being off-grid is irrelevant.
    const moving: SnapRect = { left: 40, top: 100, right: 203, bottom: 200 }
    const res = computeSnap(moving, modelFrom(CAND), SNAP_THRESHOLD, { xs: [moving.right], ys: [] })
    expect(res.dx).toBe(-3) // 203 → 200
    expect(res.guides).toHaveLength(1)
    expect(res.guides[0]).toMatchObject({ axis: 'x', position: 200 })
  })

  it('no vertical guide when ys is empty', () => {
    const moving: SnapRect = { left: 40, top: 100, right: 203, bottom: 201 }
    const res = computeSnap(moving, modelFrom(CAND), SNAP_THRESHOLD, { xs: [moving.right], ys: [] })
    expect(res.dy).toBe(0)
    expect(res.guides.every((g) => g.axis === 'x')).toBe(true)
  })
})
