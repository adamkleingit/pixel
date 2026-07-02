import { useRef, useState } from 'react'
import type { HTMLAttributes, PointerEvent as ReactPointerEvent } from 'react'
import type { Token } from '../pixel-common'

/** Modifier state read from the live pointer event each frame — callers that
 *  care (e.g. spacing inputs mirroring under alt) can expand the write into
 *  related properties. Callers that don't care simply ignore the second arg. */
export interface ScrubModifiers {
  alt: boolean
  shift: boolean
  /** ⌘ on macOS / Ctrl on Windows-Linux. Used to bypass snap-to-token. */
  meta: boolean
}

/**
 * One snap target — a token whose value happens to land near the cursor while
 * scrubbing. `numericValue` is the parsed-px (or unit-matched) numeric the
 * scrubber compares its current candidate against. `token` is forwarded back
 * to the caller via `ScrubExtras.snappedToken` so the patch can be sent
 * token-bound.
 */
export interface SnapTarget {
  numericValue: number
  token: Token
}

export interface ScrubExtras {
  /** Set when the just-emitted value snapped to a token's numeric value. The
   *  caller fires a token-bound patch (applyTokenAll) instead of a raw setStyle
   *  so the agent writes the symbolic spelling. */
  snappedToken?: Token
}

export interface UseScrubbableOptions {
  value: string
  onChange: ((value: string, modifiers?: ScrubModifiers, extras?: ScrubExtras) => void) | null
  step?: number
  min?: number | null
  max?: number | null
  precision?: number
  /** Snap-to-token configuration. Sorted by numericValue ascending. Threshold
   *  is in *output units* (after `step` scaling) — for the default `step: 1`
   *  that's pixels of cursor travel, which also equals pixels of value. */
  snap?: {
    targets: SnapTarget[]
    /** Distance (in output units) within which the candidate value gets pulled
     *  to a target. The user's chosen default is 3. */
    threshold: number
  }
}

export interface UseScrubbableResult {
  prefixProps: HTMLAttributes<HTMLSpanElement>
  isDragging: boolean
}

/**
 * Makes a numeric-input prefix draggable to scrub the value, Figma-style.
 * Spread the returned `prefixProps` on the prefix wrapper to attach handlers
 * and the `ew-resize` cursor. State is held here so the input itself can stay
 * stateless.
 *
 * Snap-to-token: when `options.snap` is set, the candidate value is pulled to
 * the nearest token within `threshold`. Holding ⌘ (macOS) / Ctrl bypasses the
 * snap while still emitting the raw value. The matched token, if any, comes
 * back to the caller via the `extras.snappedToken` arg on `onChange`.
 */
export function useScrubbable({
  value,
  onChange,
  step = 1,
  min = null,
  max = null,
  precision = 0,
  snap,
}: UseScrubbableOptions): UseScrubbableResult {
  const startRef = useRef<{ x: number; value: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function onPointerDown(e: ReactPointerEvent<HTMLSpanElement>) {
    if (e.button !== 0) return
    const start = parseFloat(value)
    startRef.current = {
      x: e.clientX,
      value: Number.isFinite(start) ? start : 0,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setIsDragging(true)
    e.preventDefault()
  }

  function onPointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    const start = startRef.current
    if (!start) return
    const dx = e.clientX - start.x
    let next = start.value + dx * step
    if (min !== null) next = Math.max(min, next)
    if (max !== null) next = Math.min(max, next)

    // Snap to nearest token within threshold, unless modifier held.
    let snappedToken: Token | undefined
    const bypassSnap = e.metaKey || e.ctrlKey
    if (snap && snap.targets.length > 0 && !bypassSnap) {
      let bestDelta = Infinity
      let best: SnapTarget | null = null
      for (const t of snap.targets) {
        const delta = Math.abs(t.numericValue - next)
        if (delta < bestDelta) {
          bestDelta = delta
          best = t
        }
      }
      if (best && bestDelta <= snap.threshold) {
        next = best.numericValue
        snappedToken = best.token
      }
    }

    const formatted =
      precision > 0 ? next.toFixed(precision) : String(Math.round(next))
    onChange?.(
      formatted,
      { alt: e.altKey, shift: e.shiftKey, meta: e.metaKey || e.ctrlKey },
      snappedToken ? { snappedToken } : undefined,
    )
  }

  function endDrag(e: ReactPointerEvent<HTMLSpanElement>) {
    if (!startRef.current) return
    startRef.current = null
    setIsDragging(false)
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return {
    prefixProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: { cursor: 'ew-resize', touchAction: 'none', userSelect: 'none' },
    },
    isDragging,
  }
}
