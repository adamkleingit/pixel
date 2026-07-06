/**
 * Bug reporter — the "Report a bug" button renders in the bar only when
 * `config.bugReport` is set. The screen recording + Vercel upload themselves
 * can't run in jsdom (getDisplayMedia / client upload), so those are verified
 * manually against the live endpoint.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { PixelProvider } from './PixelProvider'
import { Overlay } from './Overlay'

const STYLE_ID = 'pixel-styles'

afterEach(() => {
  cleanup()
  document.getElementById(STYLE_ID)?.remove()
})

describe('bug report button', () => {
  it('is hidden when no bugReport endpoint is configured', () => {
    render(
      <PixelProvider isEnabled config={{ bar: { always: true } }}>
        <Overlay />
      </PixelProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Report a bug' })).toBeNull()
  })

  it('shows in the bar when a bugReport endpoint is configured', () => {
    render(
      <PixelProvider
        isEnabled
        config={{ bar: { always: true }, bugReport: { endpoint: 'https://x.example/api/bug-report' } }}
      >
        <Overlay />
      </PixelProvider>,
    )
    expect(screen.getByRole('button', { name: 'Report a bug' })).toBeTruthy()
  })
})
