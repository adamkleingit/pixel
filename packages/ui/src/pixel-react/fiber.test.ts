/**
 * `fiber.ts` reaches into React's private internals, which moved between 18 and
 * 19. These tests mock the `react` module with each shape so both paths are
 * covered from a single React install.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeFiber {
  type: unknown
  index: number
  return: FakeFiber | null
}

/**
 * Load a fresh `fiber.ts` against a stubbed `react` module. Both internals keys
 * are always present (usually as `undefined`) because Vitest's mock namespace
 * throws on undeclared exports, where a real one yields `undefined`.
 */
async function loadFiber(reactModule: Record<string, unknown>) {
  const mod = {
    version: '0.0.0',
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: undefined,
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: undefined,
    ...reactModule,
  }
  vi.resetModules()
  vi.doMock('react', () => ({ default: mod, ...mod }))
  return import('./fiber')
}

/** React 18: the owner hangs off a mutable cell on the legacy internals object. */
function react18(owner: FakeFiber | null) {
  return {
    version: '18.3.1',
    __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: { ReactCurrentOwner: { current: owner } },
  }
}

/** React 19: the owner is read through the async dispatcher react-dom installs. */
function react19(owner: FakeFiber | null) {
  return {
    version: '19.2.0',
    __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: {
      A: { getOwner: () => owner },
    },
  }
}

function Leaf() {}
function Shell() {}

/** `Shell > Leaf`, the shape `instanceKey` walks. */
function tree(): FakeFiber {
  const root: FakeFiber = { type: Shell, index: 0, return: null }
  return { type: Leaf, index: 1, return: root }
}

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.doUnmock('react')
  vi.resetModules()
  warn.mockRestore()
})

describe('currentFiber', () => {
  it('reads the owner from React 18 internals', async () => {
    const owner = tree()
    const { currentFiber } = await loadFiber(react18(owner))
    expect(currentFiber()).toBe(owner)
    expect(warn).not.toHaveBeenCalled()
  })

  it('reads the owner from React 19 internals', async () => {
    const owner = tree()
    const { currentFiber } = await loadFiber(react19(owner))
    expect(currentFiber()).toBe(owner)
    expect(warn).not.toHaveBeenCalled()
  })

  it('resolves the dispatcher per call, since react-dom installs it after import', async () => {
    const internals: { A: { getOwner: () => FakeFiber | null } | null } = { A: null }
    const { currentFiber } = await loadFiber({
      version: '19.2.0',
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: internals,
    })

    expect(currentFiber()).toBeNull()

    const owner = tree()
    internals.A = { getOwner: () => owner }
    expect(currentFiber()).toBe(owner)
  })

  it('warns once when no build exposes an owner', async () => {
    const { currentFiber } = await loadFiber({ version: '19.2.0' })
    expect(currentFiber()).toBeNull()
    expect(currentFiber()).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('[pixel-react]')
  })
})

describe('instanceKey', () => {
  it('builds a structural root→leaf path', async () => {
    const { instanceKey } = await loadFiber(react19(null))
    expect(instanceKey(tree())).toBe('Shell#0/Leaf#1')
  })

  it('falls back to a flat key with no fiber', async () => {
    const { instanceKey } = await loadFiber(react19(null))
    expect(instanceKey(null)).toBe('@root')
  })

  it('warns once about a StrictMode ancestor without keying it as a component', async () => {
    const { instanceKey, resetStrictModeWarning } = await loadFiber(react19(null))
    resetStrictModeWarning()

    const root: FakeFiber = { type: Shell, index: 0, return: null }
    const strict: FakeFiber = { type: Symbol.for('react.strict_mode'), index: 0, return: root }
    const leaf: FakeFiber = { type: Leaf, index: 0, return: strict }

    expect(instanceKey(leaf)).toBe('Shell#0/Leaf#0')
    expect(instanceKey(leaf)).toBe('Shell#0/Leaf#0')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('StrictMode')
  })
})
