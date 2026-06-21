import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ScreenshareProvider } from './ScreenshareProvider'
import { Overlay } from './Overlay'
import { useScreenshare } from './useScreenshare'
import { clearActiveSession, getActiveSession } from './session'
import type { Recording } from './types'

// Snapshots need canvas APIs jsdom lacks; stub them out (we test capture, not pixels).
vi.mock('./capture/snapshot', () => ({
  captureFullFrame: async () => null,
  captureRegion: async () => null,
  captureStroke: async () => null,
}))

const STYLE_ID = 'screenshare-styles'

// --- Mic / MediaRecorder mocks, with counters to assert no double-construction. ---
let mediaRecorderCount = 0
let mediaRecorderStops = 0

class MockMediaRecorder {
  static isTypeSupported() {
    return true
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(
    public stream: MediaStream,
    public opts?: MediaRecorderOptions,
  ) {
    mediaRecorderCount++
  }
  start() {
    this.state = 'recording'
  }
  pause() {
    this.state = 'paused'
  }
  resume() {
    this.state = 'recording'
  }
  stop() {
    this.state = 'inactive'
    mediaRecorderStops++
    this.onstop?.()
  }
}

beforeEach(() => {
  mediaRecorderCount = 0
  mediaRecorderStops = 0
  vi.stubGlobal('MediaRecorder', MockMediaRecorder)
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
  })
  // jsdom has no elementFromPoint; the click-target lookup tolerates an empty chain.
  document.elementFromPoint = (() => null) as typeof document.elementFromPoint
})

/** Surfaces the current state and a start() trigger so tests can drive the SDK. */
function Probe() {
  const { state, start } = useScreenshare()
  return (
    <button data-testid="probe" onClick={() => start()}>
      {state}
    </button>
  )
}

/** Exposes every lifecycle control + the current state for the remount tests. */
function Harness() {
  const { state, start, stop, pause, resume } = useScreenshare()
  return (
    <div>
      <span data-testid="state">{state}</span>
      <button data-testid="start" onClick={() => start()} />
      <button data-testid="stop" onClick={() => stop()} />
      <button data-testid="pause" onClick={() => pause()} />
      <button data-testid="resume" onClick={() => resume()} />
    </div>
  )
}

/** Dispatch one Space keydown; returns false if the SDK preventDefault'd it. */
function pressSpace(): boolean {
  return fireEvent.keyDown(document, { code: 'Space', cancelable: true })
}

afterEach(() => {
  cleanup()
  document.getElementById(STYLE_ID)?.remove()
  clearActiveSession() // the session is a global singleton — don't leak across tests
  vi.unstubAllGlobals()
})

describe('ScreenshareProvider isEnabled', () => {
  it('is active by default: injects styles, shows the bar, and claims the activation key', () => {
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    expect(document.getElementById(STYLE_ID)).not.toBeNull()
    expect(screen.getByTitle('Start recording (double-tap Space)')).toBeTruthy()
    // The keyboard listener is installed → Space's default is suppressed.
    expect(pressSpace()).toBe(false)
  })

  it('is fully inert when isEnabled=false', () => {
    render(
      <ScreenshareProvider isEnabled={false} config={{ bar: { always: true } }}>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    // No styles injected and no keyboard listener (Space passes through).
    expect(document.getElementById(STYLE_ID)).toBeNull()
    expect(pressSpace()).toBe(true)

    // start() is a no-op — the session never leaves idle.
    fireEvent.click(screen.getByTestId('probe'))
    expect(screen.getByTestId('probe').textContent).toBe('idle')
  })
})

describe('session continuity across a provider remount', () => {
  // passthrough: true so the page stays interactive — otherwise block mode would
  // swallow clicks on the Harness control buttons (they're page UI, not overlay).
  const config = { bar: { always: true }, stopDelayMs: 0, passthrough: true }

  it('adopts an in-flight recording without restarting the mic', async () => {
    const first = render(
      <ScreenshareProvider config={config}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('start'))
    })
    await waitFor(() => expect(mediaRecorderCount).toBe(1))
    expect(screen.getByTestId('state').textContent).toBe('recording')

    // An event captured before the remount.
    const recorder = getActiveSession()!.recorder
    recorder.click(10, 20, 0, [])

    // Unmount the whole provider subtree (as a Storybook story switch would).
    first.unmount()
    // The recorder must keep running and the session must survive.
    expect(getActiveSession()?.recorder).toBe(recorder)
    expect(mediaRecorderStops).toBe(0)

    // A fresh provider adopts it.
    let completed: Recording | undefined
    render(
      <ScreenshareProvider config={config} onComplete={(r) => (completed = r)}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )

    // (a) state is 'recording', (b) no new MediaRecorder, (c) same Recorder instance.
    expect(screen.getByTestId('state').textContent).toBe('recording')
    expect(mediaRecorderCount).toBe(1)
    expect(getActiveSession()!.recorder).toBe(recorder)

    // An event after the remount — same buffer.
    recorder.click(30, 40, 0, [])

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop'))
    })

    // (c) the adopted recorder still held the prior events; (d) stop cleared the session.
    const clicks = completed?.events.filter((e) => e.kind === 'click') ?? []
    expect(clicks).toHaveLength(2)
    expect(getActiveSession()).toBeUndefined()
    // The mic was stopped exactly once — at stop(), not at unmount.
    expect(mediaRecorderStops).toBe(1)
  })

  it('re-installs DOM capture listeners on adoption (records events after remount)', async () => {
    const first = render(
      <ScreenshareProvider config={config}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('start'))
    })
    await waitFor(() => expect(mediaRecorderCount).toBe(1))
    first.unmount()

    let completed: Recording | undefined
    render(
      <ScreenshareProvider config={config} onComplete={(r) => (completed = r)}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )
    expect(screen.getByTestId('state').textContent).toBe('recording')

    // A real page click after the remount — only captured if the window listeners
    // were re-installed by the state==='recording' capture effect on adoption.
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { clientX: 5, clientY: 5, bubbles: true }))
      document.body.dispatchEvent(new MouseEvent('pointerup', { clientX: 5, clientY: 5, bubbles: true }))
    })

    await act(async () => {
      fireEvent.click(screen.getByTestId('stop'))
    })
    const clicks = completed?.events.filter((e) => e.kind === 'click') ?? []
    expect(clicks.length).toBeGreaterThanOrEqual(1)
  })

  it('is not corrupted by StrictMode dev double-mounting', async () => {
    render(
      <StrictMode>
        <ScreenshareProvider config={config}>
          <Harness />
          <Overlay />
        </ScreenshareProvider>
      </StrictMode>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('start'))
    })

    // Despite the mount→unmount→mount of StrictMode, exactly one recorder exists
    // and none was torn down.
    await waitFor(() => expect(mediaRecorderCount).toBe(1))
    expect(mediaRecorderStops).toBe(0)
    expect(screen.getByTestId('state').textContent).toBe('recording')
    expect(getActiveSession()?.state).toBe('recording')
  })

  it('preserves paused state across a remount', async () => {
    const first = render(
      <ScreenshareProvider config={config}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId('start'))
    })
    await waitFor(() => expect(mediaRecorderCount).toBe(1))

    act(() => {
      fireEvent.click(screen.getByTestId('pause'))
    })
    expect(screen.getByTestId('state').textContent).toBe('paused')
    expect(getActiveSession()?.state).toBe('paused')

    const recorder = getActiveSession()!.recorder
    first.unmount()

    render(
      <ScreenshareProvider config={config}>
        <Harness />
        <Overlay />
      </ScreenshareProvider>,
    )

    // Adopted as paused, same recorder, no new mic.
    expect(screen.getByTestId('state').textContent).toBe('paused')
    expect(getActiveSession()!.recorder).toBe(recorder)
    expect(mediaRecorderCount).toBe(1)
    expect(mediaRecorderStops).toBe(0)

    // Resume + stop still work on the adopted recorder.
    act(() => {
      fireEvent.click(screen.getByTestId('resume'))
    })
    expect(screen.getByTestId('state').textContent).toBe('recording')
    await act(async () => {
      fireEvent.click(screen.getByTestId('stop'))
    })
    expect(getActiveSession()).toBeUndefined()
  })
})

describe('mouse tool toggle', () => {
  it('is on by default (no passthrough) and toggles off', () => {
    render(
      <ScreenshareProvider config={{ bar: { always: true } }}>
        <Probe />
        <Overlay />
      </ScreenshareProvider>,
    )
    const tool = screen.getByRole('button', { name: 'Mouse tool' })
    // Default: mouse tool on → pressed; the page is inert / rectangles draw.
    expect(tool.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(tool)
    // Off → passthrough (no tool).
    expect(tool.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(tool)
    expect(tool.getAttribute('aria-pressed')).toBe('true')
  })
})
