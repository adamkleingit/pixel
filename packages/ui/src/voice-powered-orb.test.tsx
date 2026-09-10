import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PixelProvider } from './PixelProvider'
import { Overlay } from './Overlay'
import { VoicePoweredOrb } from './voice-powered-orb'

const STYLE_ID = 'pixel-styles'

afterEach(() => {
  cleanup()
  document.getElementById(STYLE_ID)?.remove()
  vi.unstubAllGlobals()
})

describe('VoicePoweredOrb', () => {
  it('renders the orb host without requesting the microphone when voice control is off', () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    render(<VoicePoweredOrb enableVoiceControl={false} />)

    expect(document.querySelector('[data-pixel-orb]')).not.toBeNull()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('requests the microphone when voice control is enabled', async () => {
    const getUserMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }],
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })

    render(<VoicePoweredOrb enableVoiceControl />)

    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalled())
  })
})

describe('recording orb in the overlay bar', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    })
  })

  it('replaces the Rec glyph with the voice-powered orb', () => {
    render(
      <PixelProvider config={{ bar: { always: true } }}>
        <Overlay />
      </PixelProvider>,
    )

    const rec = screen.getByTitle('Start recording (double-tap Space)')
    expect(rec.querySelector('.pixel-rec-orb')).not.toBeNull()
    expect(rec.querySelector('[data-pixel-orb]')).not.toBeNull()
    // Idle Rec must not grab the mic — Pixel owns getUserMedia once recording starts.
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
})
