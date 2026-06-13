import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ScreenshareProvider } from './ScreenshareProvider'
import { Overlay } from './Overlay'
import { useScreenshare } from './useScreenshare'

const STYLE_ID = 'screenshare-styles'

/** Surfaces the current state and a start() trigger so tests can drive the SDK. */
function Probe() {
  const { state, start } = useScreenshare()
  return (
    <button data-testid="probe" onClick={() => start()}>
      {state}
    </button>
  )
}

/** Dispatch one Space keydown; returns false if the SDK preventDefault'd it. */
function pressSpace(): boolean {
  return fireEvent.keyDown(document, { code: 'Space', cancelable: true })
}

afterEach(() => {
  cleanup()
  document.getElementById(STYLE_ID)?.remove()
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
