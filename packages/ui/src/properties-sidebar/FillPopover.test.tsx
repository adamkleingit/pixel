import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// jsdom has no ResizeObserver — the Popover positioner needs one.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= ResizeObserverStub

import { FillPopover } from './FillPopover'
import { TokensProvider } from '../tokens-context'
import type { Token } from '../pixel-common'

const mkToken = (id: string, name: string, value: string): Token => ({
  id,
  name,
  kind: 'color',
  value,
  usage: { kind: 'css-var', expr: `var(--${id})` },
  sourcePath: 'globals.css',
  declarationName: `--${id}`,
})

const TOKENS = [
  mkToken('primary', 'Primary', '#7C3AED'),
  mkToken('accent', 'Accent', 'hsl(174 72% 56%)'),
]

function Harness({
  tokens = TOKENS,
  onChangeColor,
  onTokenSelect,
}: {
  tokens?: Token[]
  onChangeColor?: (hex: string, alpha: string) => void
  onTokenSelect?: (t: Token) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <TokensProvider tokens={tokens}>
      <div ref={ref}>anchor</div>
      <FillPopover
        isOpen
        anchorRef={ref}
        hex="000000"
        alpha="100"
        onChangeColor={onChangeColor}
        onTokenSelect={onTokenSelect}
      />
    </TokensProvider>
  )
}

describe('FillPopover — color tokens replace the recents, tabs removed', () => {
  afterEach(cleanup)

  it('has no Custom / Libraries tab switcher', () => {
    render(<Harness />)
    expect(screen.queryByText('Custom')).toBeNull()
    expect(screen.queryByText('Libraries')).toBeNull()
  })

  it('renders a selectable swatch per color token', () => {
    render(<Harness />)
    expect(screen.getByTitle('Primary')).toBeTruthy()
    expect(screen.getByTitle('Accent')).toBeTruthy()
  })

  it('renders no token swatches when the project has no color tokens', () => {
    render(<Harness tokens={[]} />)
    expect(screen.queryByTitle('Primary')).toBeNull()
  })

  it('clicking a token binds it semantically via onTokenSelect', () => {
    const onTokenSelect = vi.fn()
    render(<Harness onTokenSelect={onTokenSelect} />)
    fireEvent.click(screen.getByTitle('Primary'))
    expect(onTokenSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'primary' }))
  })

  it('applies the resolved color when no onTokenSelect is wired', () => {
    const onChangeColor = vi.fn()
    render(<Harness onChangeColor={onChangeColor} />)
    fireEvent.click(screen.getByTitle('Primary'))
    expect(onChangeColor).toHaveBeenCalledWith('7C3AED', '100')
  })
})
