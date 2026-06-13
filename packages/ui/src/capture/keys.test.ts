import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installKeyboard, type KeyHandlers } from './keys'

function press(code: string, init: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true, ...init }))
}

describe('installKeyboard', () => {
  let handlers: KeyHandlers

  beforeEach(() => {
    vi.useFakeTimers()
    handlers = { onSingle: vi.fn(), onDouble: vi.fn(), onEscape: vi.fn() }
    document.body.innerHTML = ''
  })
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('fires onSingle after a single tap once the double-tap window elapses', () => {
    const cleanup = installKeyboard(undefined, handlers)
    press('Space')
    expect(handlers.onSingle).not.toHaveBeenCalled() // still waiting for a possible second tap
    vi.advanceTimersByTime(350)
    expect(handlers.onSingle).toHaveBeenCalledTimes(1)
    expect(handlers.onDouble).not.toHaveBeenCalled()
    cleanup()
  })

  it('fires onDouble (not onSingle) for two taps within the window', () => {
    const cleanup = installKeyboard(undefined, handlers)
    press('Space')
    vi.advanceTimersByTime(100)
    press('Space')
    expect(handlers.onDouble).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(350)
    expect(handlers.onSingle).not.toHaveBeenCalled()
    cleanup()
  })

  it('honors a custom key and doubleTapMs', () => {
    const cleanup = installKeyboard({ key: 'KeyR', doubleTapMs: 200 }, handlers)
    press('Space') // wrong key, ignored
    vi.advanceTimersByTime(300)
    expect(handlers.onSingle).not.toHaveBeenCalled()

    press('KeyR')
    vi.advanceTimersByTime(200)
    expect(handlers.onSingle).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('calls onEscape immediately', () => {
    const cleanup = installKeyboard(undefined, handlers)
    press('Escape')
    expect(handlers.onEscape).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('ignores the activation key while focus is in a text field', () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    const cleanup = installKeyboard(undefined, handlers)
    press('Space')
    vi.advanceTimersByTime(350)
    expect(handlers.onSingle).not.toHaveBeenCalled()
    cleanup()
  })

  it('ignores auto-repeat key events', () => {
    const cleanup = installKeyboard(undefined, handlers)
    press('Space', { repeat: true })
    vi.advanceTimersByTime(350)
    expect(handlers.onSingle).not.toHaveBeenCalled()
    cleanup()
  })

  it('prevents the activation key default (e.g. Space scrolling)', () => {
    const cleanup = installKeyboard(undefined, handlers)
    const ev = new KeyboardEvent('keydown', { code: 'Space', cancelable: true })
    document.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
    cleanup()
  })

  it('stops responding after cleanup', () => {
    const cleanup = installKeyboard(undefined, handlers)
    cleanup()
    press('Space')
    vi.advanceTimersByTime(350)
    press('Escape')
    expect(handlers.onSingle).not.toHaveBeenCalled()
    expect(handlers.onEscape).not.toHaveBeenCalled()
  })
})
