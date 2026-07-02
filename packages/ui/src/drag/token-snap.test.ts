/**
 * Token snapping engine — the math + modifier model that makes on-canvas drags
 * (padding / margin / gap / radius) snap to the project's design-token values.
 * Pins the `within` / `off` (⌘/Ctrl) / `only` (Shift) behaviour the acceptance
 * calls for, plus the registry that bridges React tokens to the drag sessions.
 */
import { describe, expect, it } from 'vitest'
import type { Token } from '../pixel-common'
import {
  getSnapTargets,
  matchTokenForValue,
  setSnapTargets,
  snapModeFromEvent,
  snapToTargets,
  type SnapTarget,
} from './token-snap'

const tok = (name: string, value: string): Token => ({
  id: `t:${name}`,
  name,
  kind: 'spacing',
  value,
  usage: { kind: 'utility', className: `p-${name}` },
  sourcePath: 'globals.css',
  declarationName: `--space-${name}`,
})

// space-2 = 8px, space-4 = 16px, space-8 = 32px
const targets: SnapTarget[] = [
  { value: 8, token: tok('2', '8px') },
  { value: 16, token: tok('4', '16px') },
  { value: 32, token: tok('8', '32px') },
]

describe('snapModeFromEvent', () => {
  it('⌘ or Ctrl → off (smooth drag, snapping bypassed)', () => {
    expect(snapModeFromEvent({ metaKey: true, ctrlKey: false, shiftKey: false })).toBe('off')
    expect(snapModeFromEvent({ metaKey: false, ctrlKey: true, shiftKey: false })).toBe('off')
  })
  it('Shift → only (token values exclusively)', () => {
    expect(snapModeFromEvent({ metaKey: false, ctrlKey: false, shiftKey: true })).toBe('only')
  })
  it('no modifier → within (snap near a token, else smooth)', () => {
    expect(snapModeFromEvent({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe('within')
  })
  it('⌘ wins over Shift so a smooth drag is always one key away', () => {
    expect(snapModeFromEvent({ metaKey: true, ctrlKey: false, shiftKey: true })).toBe('off')
  })
})

describe('snapToTargets', () => {
  it('within: pulls to the nearest token only inside the threshold', () => {
    expect(snapToTargets(17, targets, 'within')).toEqual({ value: 16, token: targets[1].token }) // 1px away → snap
    expect(snapToTargets(24, targets, 'within')).toEqual({ value: 24 }) // 8px from both 16 and 32 → no snap
  })
  it('off: never snaps, even right on a token', () => {
    expect(snapToTargets(16, targets, 'off')).toEqual({ value: 16 }) // no token attached
  })
  it('only: jumps to the nearest token regardless of distance', () => {
    expect(snapToTargets(24, targets, 'only')).toEqual({ value: 16, token: targets[1].token })
    expect(snapToTargets(40, targets, 'only')).toEqual({ value: 32, token: targets[2].token })
  })
  it('no targets: returns the raw value unchanged', () => {
    expect(snapToTargets(17, [], 'only')).toEqual({ value: 17 })
  })
})

describe('matchTokenForValue', () => {
  it('binds a committed value (string or number) coinciding with a token', () => {
    expect(matchTokenForValue('16px', targets)?.name).toBe('4')
    expect(matchTokenForValue(32, targets)?.name).toBe('8')
  })
  it('returns undefined when the value matches no token', () => {
    expect(matchTokenForValue('17px', targets)).toBeUndefined()
  })
})

describe('snap registry (React tokens → non-React drag sessions)', () => {
  it('round-trips published targets per kind', () => {
    setSnapTargets('spacing', targets)
    expect(getSnapTargets('spacing').map((t) => t.value)).toEqual([8, 16, 32])
    setSnapTargets('spacing', [])
    expect(getSnapTargets('spacing')).toEqual([])
  })
})
