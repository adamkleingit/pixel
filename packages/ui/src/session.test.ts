import { afterEach, describe, expect, it } from 'vitest'
import {
  clearActiveSession,
  getActiveSession,
  setActiveSession,
  updateActiveSession,
} from './session'
import type { Recorder } from './recorder'

// The session only stores the recorder by reference, so a stand-in object is fine.
const fakeRecorder = {} as Recorder

afterEach(() => clearActiveSession())

describe('activeSession singleton', () => {
  it('is empty by default', () => {
    expect(getActiveSession()).toBeUndefined()
  })

  it('set then get round-trips, holding the recorder by reference', () => {
    setActiveSession({ recorder: fakeRecorder, state: 'recording', passthrough: false })
    expect(getActiveSession()).toMatchObject({ state: 'recording', passthrough: false })
    expect(getActiveSession()?.recorder).toBe(fakeRecorder)
  })

  it('update patches an existing session, leaving other fields intact', () => {
    setActiveSession({ recorder: fakeRecorder, state: 'recording', passthrough: false })
    updateActiveSession({ state: 'paused' })
    expect(getActiveSession()?.state).toBe('paused')
    expect(getActiveSession()?.passthrough).toBe(false)
  })

  it('update is a no-op when there is no session', () => {
    updateActiveSession({ state: 'paused' })
    expect(getActiveSession()).toBeUndefined()
  })

  it('clear removes the session', () => {
    setActiveSession({ recorder: fakeRecorder, state: 'recording', passthrough: true })
    clearActiveSession()
    expect(getActiveSession()).toBeUndefined()
  })

  it('is keyed by a shared global symbol so duplicate module copies agree', () => {
    setActiveSession({ recorder: fakeRecorder, state: 'recording', passthrough: true })
    const shared = (globalThis as Record<symbol, unknown>)[Symbol.for('@getpixel/ui.activeSession')]
    expect((shared as { passthrough?: boolean })?.passthrough).toBe(true)
  })
})
