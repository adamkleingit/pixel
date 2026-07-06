/**
 * Token snapping for on-canvas drags — the shared engine that makes dragging
 * padding / margin / gap / corner-radius / rotation snap to the project's
 * design tokens, mirroring the design-pane scrub behaviour (`useScrubbable`).
 *
 * **Modifier model** (read live each frame from the pointer/keyboard event):
 *   - plain drag → `within`: the value is pulled to the nearest token only when
 *     it lands within `SNAP_THRESHOLD` of one; otherwise it scrubs smoothly.
 *   - **⌘ (macOS) / Ctrl** → `off`: snapping is bypassed for a smooth drag.
 *   - **Shift** → `only`: the value can *only* be a token value — it jumps to
 *     the nearest target with no intermediate values.
 *
 * The drag sessions live in plain (non-React) modules, so they can't read the
 * tokens context with a hook. Instead the handle components publish their
 * token list into the module-level registry below (`setSnapTargets`) and the
 * `start*Drag` functions read it back at gesture start (`getSnapTargets`).
 *
 * Rotation has no token kind, so it snaps to a fixed angular step
 * (`snapToStep`) under the same modifier model.
 */

import type { Token } from '../pixel-common'

/** One snap candidate. `token` is absent for non-token steps (rotation). */
export interface SnapTarget {
  value: number
  token?: Token
}

export type SnapMode = 'within' | 'off' | 'only'

/** Distance (in value units) within which `within` mode pulls to a target.
 *  Matches the design pane's `useScrubbable` threshold of 3. */
export const SNAP_THRESHOLD = 3

/** Resolve the active snap mode from the live modifier state. ⌘/Ctrl wins over
 *  Shift so a smooth drag is always one key away. */
export function snapModeFromEvent(e: {
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
}): SnapMode {
  if (e.metaKey || e.ctrlKey) return 'off'
  if (e.shiftKey) return 'only'
  return 'within'
}

/** Nearest target to `raw`, or null when there are none. */
function nearest(raw: number, targets: readonly SnapTarget[]): SnapTarget | null {
  let best: SnapTarget | null = null
  let bestDelta = Infinity
  for (const t of targets) {
    const d = Math.abs(t.value - raw)
    if (d < bestDelta) {
      bestDelta = d
      best = t
    }
  }
  return best
}

/**
 * Snap `raw` to the nearest of `targets` per `mode`. Returns the (possibly
 * unchanged) value and the token it landed on, if any.
 */
export function snapToTargets(
  raw: number,
  targets: readonly SnapTarget[],
  mode: SnapMode,
  threshold = SNAP_THRESHOLD,
): { value: number; token?: Token } {
  if (mode === 'off' || targets.length === 0) return { value: raw }
  const best = nearest(raw, targets)
  if (!best) return { value: raw }
  if (mode === 'only' || Math.abs(best.value - raw) <= threshold) {
    return { value: best.value, token: best.token }
  }
  return { value: raw }
}

/** Step-based variant for rotation (no tokens): snap to multiples of `step`. */
export function snapToStep(
  raw: number,
  step: number,
  mode: SnapMode,
  threshold = SNAP_THRESHOLD,
): number {
  if (mode === 'off') return raw
  const snapped = Math.round(raw / step) * step
  if (mode === 'only' || Math.abs(snapped - raw) <= threshold) return snapped
  return raw
}

/** Token whose value coincides with `value` (within 0.5 — the rounding the
 *  inputs use), or undefined. Used at commit time to bind a snapped drag to its
 *  token so the agent writes the symbolic spelling. Accepts a CSS string
 *  (`"16px"`) or a number. */
export function matchTokenForValue(
  value: string | number,
  targets: readonly SnapTarget[],
): Token | undefined {
  const n = typeof value === 'number' ? value : parseFloat(value)
  if (!Number.isFinite(n)) return undefined
  for (const t of targets) {
    if (t.token && Math.abs(t.value - n) < 0.5) return t.token
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Registry — bridges the React tokens context to the module-level drag sessions
// ---------------------------------------------------------------------------

export type SnapKind = 'spacing' | 'radius'

const registry: Record<SnapKind, SnapTarget[]> = {
  spacing: [],
  radius: [],
}

/** Publish the current token targets for a kind. Called from the handle
 *  components whenever the project's tokens load or change. */
export function setSnapTargets(kind: SnapKind, targets: SnapTarget[]): void {
  registry[kind] = targets
}

/** Read the latest published targets for a kind — used by `start*Drag`. */
export function getSnapTargets(kind: SnapKind): SnapTarget[] {
  return registry[kind]
}
