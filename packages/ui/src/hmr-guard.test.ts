import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installHmrGuard, isHmrSessionActive, setHmrSessionActive, shouldDeferHmr } from './hmr-guard'

/** A stand-in for Vite's `import.meta.hot` that captures registered handlers. */
function fakeHot() {
  const handlers = new Map<string, (payload: unknown) => void>()
  return {
    on: (event: string, cb: (payload: unknown) => void) => handlers.set(event, cb),
    fire: (event: string) => handlers.get(event)?.(undefined),
    has: (event: string) => handlers.has(event),
  }
}

describe('hmr-guard', () => {
  let reload: ReturnType<typeof vi.fn>

  beforeEach(() => {
    setHmrSessionActive(false) // reset gate between tests
    reload = vi.fn()
    // jsdom's location.reload isn't a spy — override it.
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload },
      writable: true,
      configurable: true,
    })
  })
  afterEach(() => {
    setHmrSessionActive(false)
  })

  it('defers HMR only while a session is active, and records it as pending', () => {
    expect(isHmrSessionActive()).toBe(false)
    expect(shouldDeferHmr()).toBe(false) // idle → don't block

    setHmrSessionActive(true)
    expect(isHmrSessionActive()).toBe(true)
    expect(shouldDeferHmr()).toBe(true) // active → block + mark pending
  })

  it('applies exactly one reload when the session ends with a deferred change', () => {
    setHmrSessionActive(true)
    shouldDeferHmr() // a rebuild happened mid-session
    shouldDeferHmr() // ...and another
    expect(reload).not.toHaveBeenCalled() // held back while active

    setHmrSessionActive(false)
    expect(reload).toHaveBeenCalledTimes(1) // one catch-up reload
  })

  it('does not reload on session end when nothing was deferred', () => {
    setHmrSessionActive(true)
    setHmrSessionActive(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('setHmrSessionActive is idempotent (no double reload)', () => {
    setHmrSessionActive(true)
    shouldDeferHmr()
    setHmrSessionActive(false)
    setHmrSessionActive(false) // no-op
    expect(reload).toHaveBeenCalledTimes(1)
  })

  describe('installHmrGuard', () => {
    it('registers the update + full-reload hooks and throws to abort while active', () => {
      const hot = fakeHot()
      installHmrGuard(hot)
      expect(hot.has('vite:beforeUpdate')).toBe(true)
      expect(hot.has('vite:beforeFullReload')).toBe(true)

      // Idle → the hook is a no-op (Vite proceeds).
      expect(() => hot.fire('vite:beforeUpdate')).not.toThrow()

      // Active → the hook throws, which aborts Vite's update/reload.
      setHmrSessionActive(true)
      expect(() => hot.fire('vite:beforeUpdate')).toThrow(/deferred/)
      expect(() => hot.fire('vite:beforeFullReload')).toThrow(/deferred/)

      // The aborts were recorded, so ending the session reloads once.
      setHmrSessionActive(false)
      expect(reload).toHaveBeenCalledTimes(1)
    })

    it('is a safe no-op when there is no hot context (production build)', () => {
      expect(() => installHmrGuard(undefined)).not.toThrow()
      expect(() => installHmrGuard(false)).not.toThrow()
    })
  })
})
