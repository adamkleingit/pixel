import { afterEach, describe, expect, it } from 'vitest'
import {
  MAX_FRAMES,
  MISSING,
  __resetStore,
  captureLive,
  clearFrames,
  getFrames,
  getVersion,
  inject,
  record,
  setMode,
  snapshot,
} from './store'

afterEach(() => __resetStore())

describe('pixel-react store — capture', () => {
  it('records hook values into the live map', () => {
    record('App#0', 'state', 0, 'hello')
    record('App#0', 'state', 1, 42)
    const frame = snapshot()
    expect(frame).not.toBeNull()
    const slot = frame!.data.get('App#0')
    expect(slot?.state).toEqual(['hello', 42])
  })

  it('snapshots a distinct commit as a frame, and skips no-op commits', () => {
    record('A#0', 'state', 0, 1)
    expect(snapshot()).not.toBeNull()
    // Same values → no new frame.
    record('A#0', 'state', 0, 1)
    expect(snapshot()).toBeNull()
    // Changed value → new frame.
    record('A#0', 'state', 0, 2)
    expect(snapshot()).not.toBeNull()
    expect(getFrames()).toHaveLength(2)
  })

  it('caps the frame list at MAX_FRAMES, dropping the oldest', () => {
    for (let i = 0; i < MAX_FRAMES + 10; i++) {
      record('A#0', 'state', 0, i)
      snapshot()
    }
    const frames = getFrames()
    expect(frames).toHaveLength(MAX_FRAMES)
    // Oldest surviving frame's value is the (i=10)th, since 10 were dropped.
    expect(frames[0].data.get('A#0')?.state[0]).toBe(10)
    expect(frames[frames.length - 1].data.get('A#0')?.state[0]).toBe(MAX_FRAMES + 9)
  })

  it('bumps the version on every frame-list change', () => {
    const v0 = getVersion()
    record('A#0', 'state', 0, 1)
    snapshot()
    expect(getVersion()).toBeGreaterThan(v0)
    const v1 = getVersion()
    clearFrames()
    expect(getVersion()).toBeGreaterThan(v1)
  })

  it('holds captured objects by reference (no clone) — state-capture §3', () => {
    const obj = { n: 1 }
    record('A#0', 'state', 0, obj)
    const frame = snapshot()!
    expect(frame.data.get('A#0')?.state[0]).toBe(obj)
  })
})

describe('pixel-react store — inject', () => {
  it('returns the active frame value for a slot, or MISSING', () => {
    record('A#0', 'state', 0, 'v0')
    const frame = snapshot()!
    setMode('suppress', frame)
    expect(inject('A#0', 'state', 0)).toBe('v0')
    expect(inject('A#0', 'state', 1)).toBe(MISSING) // out of range
    expect(inject('Missing#0', 'state', 0)).toBe(MISSING) // unknown instance
  })

  it('captureLive() snapshots without pushing to the list', () => {
    record('A#0', 'state', 0, 'live')
    const before = getFrames().length
    const live = captureLive()
    expect(getFrames().length).toBe(before)
    expect(live.data.get('A#0')?.state[0]).toBe('live')
  })
})
