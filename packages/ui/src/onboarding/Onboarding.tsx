import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { usePixelContext } from '../context'
import { completeStage, readFlags, type OnbFlags, type OnbStage } from './store'

/** A single callout: which bar/pane element to point at, and what to say. */
interface TourTarget {
  /** The element's `data-pixel-tour` value. */
  tour: string
  text: ReactNode
}

/** Small keyboard-hint chip used inside callout copy. */
function K({ children }: { children: ReactNode }) {
  return <kbd className="pixel-onb-kbd">{children}</kbd>
}

/**
 * The four onboarding stages. Each shows its callouts all at once (an annotated
 * diagram of the relevant controls), dismissed by one CTA; stages with a `popup`
 * then show a single follow-up message before completing.
 */
const STAGES: Record<
  OnbStage,
  { cta: string; targets: TourTarget[]; popup?: ReactNode }
> = {
  welcome: {
    cta: 'Got it',
    targets: [
      { tour: 'record', text: <>Record what you want — click here or double-tap <K>Space</K>.</> },
      { tour: 'edit', text: <>Edit your UI directly — click here or double-tap <K>Enter</K>.</> },
      { tour: 'comment', text: <>Comment — pin notes on anything for your agent.</> },
      { tour: 'time-travel', text: <>Time-travel between your app’s states.</> },
    ],
  },
  recording: {
    cta: 'Got it',
    targets: [
      { tour: 'stop', text: <>Stop — click here or double-tap <K>Space</K>.</> },
      {
        tour: 'mouse',
        text: (
          <>
            <K>M</K> toggles the mouse tool for clicking &amp; dragging. Turn it off and
            clicks pass through to your app.
          </>
        ),
      },
      { tour: 'pause', text: <>Pause / resume — or tap <K>Space</K>.</> },
      { tour: 'cancel', text: <>Cancel — <K>X</K> or <K>Esc</K>.</> },
    ],
    popup: (
      <>
        Now just <strong>point, talk, click, drag, or ⌘-drag</strong> anywhere to show me
        what you mean.
      </>
    ),
  },
  postRecording: {
    cta: 'Got it',
    targets: [
      {
        tour: 'changelog',
        text: <>Your recordings, edits &amp; comments show up here — track their status in the changelog.</>,
      },
    ],
  },
  editing: {
    cta: 'Got it',
    // Order matters: within each side, callouts stack in this order. `design`
    // (a full-height pane) is listed last so its bubble sits below the bar-button
    // callouts (Save / Cancel / Change history) rather than in their middle.
    targets: [
      { tour: 'elements', text: <>Layers — every element on the page.</> },
      { tour: 'save', text: <>Save your edits — or double-tap <K>Enter</K>.</> },
      { tour: 'cancel-edit', text: <>Cancel — <K>X</K> or <K>Esc</K> reverts everything.</> },
      { tour: 'history', text: <>Change history — jump between edits.</> },
      { tour: 'design', text: <>Design — colors, spacing &amp; type, bound to your design tokens.</> },
    ],
    popup: (
      <>
        Select with <strong>click, double-click, or ⌘-click</strong>. It works just like
        Figma — modifier keys, multi-select, and undo/redo (<K>⌘Z</K> / <K>⇧⌘Z</K>).
      </>
    ),
  },
  commenting: {
    cta: 'Got it',
    targets: [
      { tour: 'save', text: <>Save — sends every pin to your agent.</> },
      { tour: 'cancel-comment', text: <>Cancel — <K>X</K> or <K>Esc</K> discards the pins.</> },
    ],
    popup: (
      <>
        Click anywhere to <strong>drop a comment pin</strong>. Edit or delete pins before
        you Save.
      </>
    ),
  },
}

interface Pos {
  side: 'left' | 'right'
  top: number
  left?: number
  right?: number
  ring: { left: number; top: number; width: number; height: number }
  line: { x1: number; y1: number; x2: number; y2: number }
}

const posSig = (m: Record<string, Pos>) =>
  Object.entries(m)
    .map(([k, p]) => `${k}:${Math.round(p.top)}:${Math.round(p.left ?? p.right ?? 0)}`)
    .join('|')

/**
 * Renders a set of anchored callouts (ring + tooltip + connector) for the given
 * targets, plus one CTA. Targets are re-measured every frame so the callouts track
 * the bar wherever it's docked and follow layout shifts. Tooltips on the same side
 * are de-collided into a column. If no target is ever on screen, `onEmpty` fires so
 * the orchestrator can skip the stage instead of stranding the user.
 */
function TourLayer({
  targets,
  cta,
  onDismiss,
  onEmpty,
}: {
  targets: TourTarget[]
  cta: string
  onDismiss: () => void
  onEmpty: () => void
}) {
  const [rects, setRects] = useState<Record<string, DOMRect>>({})
  const [positions, setPositions] = useState<Record<string, Pos>>({})
  const [ctaPos, setCtaPos] = useState<{ left: number; top: number } | null>(null)
  const tipRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const emptied = useRef(false)

  // Measure every frame; only commit when a rounded signature actually changes.
  useEffect(() => {
    let raf = 0
    let prevSig = ''
    const measure = () => {
      const next: Record<string, DOMRect> = {}
      for (const t of targets) {
        const el = document.querySelector<HTMLElement>(`[data-pixel-tour="${t.tour}"]`)
        if (el) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && r.height > 0) next[t.tour] = r
        }
      }
      const sig = targets
        .map((t) => {
          const r = next[t.tour]
          return r ? `${t.tour}:${r.left | 0},${r.top | 0},${r.width | 0},${r.height | 0}` : `${t.tour}:x`
        })
        .join('|')
      if (sig !== prevSig) {
        prevSig = sig
        setRects(next)
      }
      raf = requestAnimationFrame(measure)
    }
    raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [targets])

  // Skip the stage if nothing to point at ever shows up (e.g. the bar is hidden).
  useEffect(() => {
    if (emptied.current) return
    const id = window.setTimeout(() => {
      if (Object.keys(rects).length === 0) {
        emptied.current = true
        onEmpty()
      }
    }, 500)
    return () => window.clearTimeout(id)
  }, [rects, onEmpty])

  // Lay tooltips out from the measured target rects + rendered tooltip heights.
  useLayoutEffect(() => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const GAP = 14
    const MARGIN = 10
    const VGAP = 10

    type Item = { tour: string; side: 'left' | 'right'; targetY: number; near: number; h: number }
    const items: Item[] = []
    for (const t of targets) {
      const r = rects[t.tour]
      if (!r) continue
      const side: 'left' | 'right' = (r.left + r.right) / 2 > vw / 2 ? 'left' : 'right'
      const h = tipRefs.current[t.tour]?.offsetHeight ?? 44
      items.push({
        tour: t.tour,
        side,
        targetY: (r.top + r.bottom) / 2,
        near: side === 'left' ? r.left : r.right,
        h,
      })
    }

    const out: Record<string, Pos> = {}
    // Track the group's bounding box so the CTA can sit just below the tooltips.
    const box = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity }
    for (const side of ['left', 'right'] as const) {
      // Keep the authored `targets` order within each side (the cursor only pushes
      // tooltips down, so authored order is preserved even when a tall target — a
      // full-height pane — has a target-center between two bar buttons).
      const group = items.filter((i) => i.side === side)
      let cursor = MARGIN
      for (const it of group) {
        let top = it.targetY - it.h / 2
        if (top < cursor) top = cursor
        if (top + it.h > vh - MARGIN) top = Math.max(MARGIN, vh - MARGIN - it.h)
        cursor = top + it.h + VGAP
        const r = rects[it.tour]
        const w = tipRefs.current[it.tour]?.offsetWidth ?? 220
        const rightEdge = side === 'left' ? r.left - GAP : r.right + GAP + w
        const leftEdge = side === 'left' ? r.left - GAP - w : r.right + GAP
        box.left = Math.min(box.left, leftEdge)
        box.right = Math.max(box.right, rightEdge)
        box.top = Math.min(box.top, top)
        box.bottom = Math.max(box.bottom, top + it.h)
        out[it.tour] = {
          side,
          top,
          left: side === 'right' ? r.right + GAP : undefined,
          right: side === 'left' ? vw - (r.left - GAP) : undefined,
          ring: { left: r.left, top: r.top, width: r.width, height: r.height },
          line: {
            x1: it.near,
            y1: it.targetY,
            x2: side === 'left' ? r.left - GAP : r.right + GAP,
            y2: top + it.h / 2,
          },
        }
      }
    }
    setPositions((prev) => (posSig(prev) === posSig(out) ? prev : out))

    // Place the CTA under the *dominant* tip column (the side with more tips),
    // not the bounding box of both sides. Averaging left+right when Elements
    // (left pane) and Design/bar (right) both have tips parks "Got it" in the
    // middle of the page — away from the wizard bubbles.
    const CTA_H = 40
    let cta: { left: number; top: number } | null = null
    if (items.length) {
      const leftCount = items.filter((i) => i.side === 'left').length
      const rightCount = items.filter((i) => i.side === 'right').length
      const dominant: 'left' | 'right' = rightCount >= leftCount ? 'right' : 'left'
      let sLeft = Infinity
      let sRight = -Infinity
      let sTop = Infinity
      let sBottom = -Infinity
      for (const it of items.filter((i) => i.side === dominant)) {
        const p = out[it.tour]
        if (!p) continue
        const w = tipRefs.current[it.tour]?.offsetWidth ?? 220
        const leftEdge = p.left ?? vw - (p.right ?? 0) - w
        const rightEdge = p.left != null ? p.left + w : vw - (p.right ?? 0)
        sLeft = Math.min(sLeft, leftEdge)
        sRight = Math.max(sRight, rightEdge)
        sTop = Math.min(sTop, p.top)
        sBottom = Math.max(sBottom, p.top + it.h)
      }
      if (Number.isFinite(sLeft)) {
        let top = sBottom + 12
        if (top + CTA_H + 12 > vh) top = Math.max(12, sTop - CTA_H - 12)
        cta = { left: Math.max(64, Math.min(vw - 64, (sLeft + sRight) / 2)), top }
      } else {
        let top = box.bottom + 12
        if (top + CTA_H + 12 > vh) top = Math.max(12, box.top - CTA_H - 12)
        cta = { left: Math.max(64, Math.min(vw - 64, (box.left + box.right) / 2)), top }
      }
    }
    setCtaPos((prev) =>
      prev && cta && Math.round(prev.left) === Math.round(cta.left) && Math.round(prev.top) === Math.round(cta.top)
        ? prev
        : cta,
    )
  }, [rects, targets])

  const visible = Object.keys(positions).length > 0
  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0

  return (
    <div className="pixel-onb-layer">
      {/* Connector lines from each tooltip to its target. */}
      <svg className="pixel-onb-lines" width={vw} height={vh} aria-hidden="true">
        {Object.values(positions).map((p, i) => (
          <g key={i}>
            <line x1={p.line.x1} y1={p.line.y1} x2={p.line.x2} y2={p.line.y2} />
            <circle cx={p.line.x1} cy={p.line.y1} r={3} />
          </g>
        ))}
      </svg>

      {/* Pulsing highlight rings. */}
      {Object.entries(positions).map(([tour, p]) => (
        <div
          key={`ring-${tour}`}
          className="pixel-onb-ring"
          style={{ left: p.ring.left, top: p.ring.top, width: p.ring.width, height: p.ring.height }}
        />
      ))}

      {/* Tooltips — rendered for every measured target so heights can be read; the
          layout effect then positions them (opacity 0 until placed). */}
      {targets.map((t) => {
        const r = rects[t.tour]
        if (!r) return null
        const p = positions[t.tour]
        return (
          <div
            key={`tip-${t.tour}`}
            ref={(el) => {
              tipRefs.current[t.tour] = el
            }}
            className={`pixel-onb-tip${p ? ` placed ${p.side}` : ''}`}
            style={p ? { top: p.top, left: p.left, right: p.right } : { top: -9999, left: 0 }}
          >
            {t.text}
          </div>
        )
      })}

      {visible && ctaPos && (
        <div className="pixel-onb-cta" style={{ left: ctaPos.left, top: ctaPos.top }}>
          <button type="button" className="pixel-onb-btn" onClick={onDismiss}>
            {cta}
          </button>
        </div>
      )}
    </div>
  )
}

/** A single centered follow-up message with a dismiss button. */
function OnbPopup({ text, cta, onDismiss }: { text: ReactNode; cta: string; onDismiss: () => void }) {
  return (
    <div className="pixel-onb-layer">
      <div className="pixel-onb-popup" role="dialog" aria-label="Pixel tip">
        <div className="pixel-onb-popup-text">{text}</div>
        <button type="button" className="pixel-onb-btn" onClick={onDismiss}>
          {cta}
        </button>
      </div>
    </div>
  )
}

/**
 * First-run onboarding orchestrator. Watches Pixel's state machine and surfaces at
 * most one stage at a time: the welcome callouts on load, the recording controls
 * the first time a recording starts, the changelog after the first recording, and
 * the edit-mode controls the first time edit mode is entered. Each is dismissed
 * forever via `store` (localStorage). Renders nothing when onboarding is disabled
 * or every stage is done.
 */
export function Onboarding() {
  const { state, editing, commenting, onboarding } = usePixelContext()
  const [flags, setFlags] = useState<OnbFlags>(() => readFlags())
  const [justRecorded, setJustRecorded] = useState(false)
  const prevState = useRef(state)

  // A recording just finished → arm the post-recording (changelog) hint.
  useEffect(() => {
    const p = prevState.current
    prevState.current = state
    if ((p === 'recording' || p === 'paused') && state === 'idle') setJustRecorded(true)
  }, [state])

  const recording = state === 'recording' || state === 'paused'
  const idle = state === 'idle'
  const stageId: OnbStage | null = !onboarding
    ? null
    : editing && !flags.editing
      ? 'editing'
      : commenting && !flags.commenting
        ? 'commenting'
        : recording && !flags.recording
          ? 'recording'
          : idle && justRecorded && !flags.postRecording
            ? 'postRecording'
            : idle &&
                !flags.welcome &&
                !flags.recording &&
                !flags.editing &&
                !flags.commenting &&
                !flags.postRecording
              ? 'welcome'
              : null

  const [phase, setPhase] = useState<'labels' | 'popup'>('labels')
  // Reset to the labels phase whenever the active stage changes.
  useEffect(() => {
    setPhase('labels')
  }, [stageId])

  const finish = useCallback((id: OnbStage) => {
    setFlags(completeStage(id))
    if (id === 'postRecording') setJustRecorded(false)
  }, [])

  if (!stageId) return null
  const stage = STAGES[stageId]

  if (phase === 'popup' && stage.popup) {
    return <OnbPopup key={`${stageId}-popup`} text={stage.popup} cta={stage.cta} onDismiss={() => finish(stageId)} />
  }

  return (
    <TourLayer
      key={`${stageId}-labels`}
      targets={stage.targets}
      cta={stage.cta}
      onDismiss={() => (stage.popup ? setPhase('popup') : finish(stageId))}
      onEmpty={() => finish(stageId)}
    />
  )
}
