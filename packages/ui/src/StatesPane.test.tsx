import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { PixelContext, type PixelContextValue } from './context'
import { StatesPane } from './StatesPane'

afterEach(() => {
  cleanup()
  document.documentElement.style.marginRight = ''
  document.documentElement.style.removeProperty('--pixel-dock-right')
})

function renderPane(overrides: Partial<PixelContextValue> = {}) {
  const resumeLive = vi.fn()
  const value = {
    stateFrames: [{ id: 1, at: Date.now() }],
    frozenIndex: null,
    gotoState: vi.fn(),
    stepStateBack: vi.fn(),
    stepStateForward: vi.fn(),
    resumeLive,
    ...overrides,
  } as PixelContextValue

  render(
    <PixelContext.Provider value={value}>
      <StatesPane />
    </PixelContext.Provider>,
  )
  return { resumeLive }
}

describe('StatesPane close (X)', () => {
  it('calls resumeLive when the header X is clicked (expanded)', () => {
    const { resumeLive } = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Close state history' }))
    expect(resumeLive).toHaveBeenCalledTimes(1)
  })

  it('keeps the X visible when collapsed and still calls resumeLive', () => {
    const { resumeLive } = renderPane()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse state history pane' }))
    expect(screen.getByRole('button', { name: 'Close state history' })).toBeTruthy()
    expect(screen.getByLabelText('State history pane').className).toContain('collapsed')
    fireEvent.click(screen.getByRole('button', { name: 'Close state history' }))
    expect(resumeLive).toHaveBeenCalledTimes(1)
  })
})
