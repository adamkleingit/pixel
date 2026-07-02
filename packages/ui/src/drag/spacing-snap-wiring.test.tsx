/**
 * Wiring test for the token → canvas-drag-snap seam. The on-canvas drag sessions
 * are plain (non-React) modules; they read snap targets from a module registry
 * that the handle components publish into from the React tokens context. This
 * pins that mounting `SpacingHandles` under a populated `TokensProvider` actually
 * fills the spacing registry — the path that makes padding/margin/gap drags snap
 * to the project's spacing tokens. (Was previously dead: the handles rendered
 * outside any TokensProvider, so the registry stayed empty.)
 *
 * The publish runs in a `useEffect`, which fires regardless of the component's
 * hover-gated null return, so no hover simulation is needed.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import type { Token } from '../pixel-common'
import type { Rect } from '../selection/selection-utils'
import { TokensProvider } from '../tokens-context'
import { SpacingHandles } from './SpacingHandles'
import { getSnapTargets, setSnapTargets } from './token-snap'

const spacingToken = (name: string, value: string): Token => ({
  id: `t:${name}`,
  name,
  kind: 'spacing',
  value,
  usage: { kind: 'utility', className: `p-${name}` },
  sourcePath: 'globals.css',
  declarationName: `--space-${name}`,
})

const rect: Rect = { top: 0, left: 0, width: 100, height: 40, radius: '0px', rotation: 0 }

afterEach(() => {
  cleanup()
  setSnapTargets('spacing', []) // reset module state between tests
})

describe('SpacingHandles publishes context tokens to the drag snap registry', () => {
  it('fills the spacing registry from the tokens context', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)

    render(
      <TokensProvider tokens={[spacingToken('2', '8px'), spacingToken('4', '16px')]}>
        <SpacingHandles rect={rect} element={el} />
      </TokensProvider>,
    )

    // The publish effect ran on mount → the non-React drag sessions can now snap.
    expect(getSnapTargets('spacing').map((t) => t.value).sort((a, b) => a - b)).toEqual([8, 16])
  })

  it('publishes an empty set when the project has no spacing tokens', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    render(
      <TokensProvider tokens={[]}>
        <SpacingHandles rect={rect} element={el} />
      </TokensProvider>,
    )
    expect(getSnapTargets('spacing')).toEqual([])
  })
})
