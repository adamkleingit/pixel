import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import type { Token } from '../pixel-common'
import { FillPopover } from './FillPopover'
import { IconButton } from './IconButton'
import { PaintRow } from './PaintRow'
import { Section } from './Section'
import { plusIcon } from './icons'
import { COLORS } from './tokens'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { normalizeHex, rgbStringToHexAlpha } from '../edit/color'
import {
  defaultSolid,
  paintsSignature,
  paintsToStyles,
  paintToPreview,
  readPaints,
  type BackgroundPaint,
} from '../edit/background-paint'

export interface FillSectionProps {
  elements?: Element[]
}

/** A blank (fully-transparent) solid — the "no background" placeholder row. */
function isBlank(p: BackgroundPaint): boolean {
  return p.kind === 'solid' && (!p.hex || p.alpha === '0')
}

/** Move the item at `from` to index `to`, returning a new array. */
function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/**
 * The element's background as an ordered stack of paints (order matters — the
 * first row is the topmost layer). Each layer can be a solid color, a gradient,
 * or an image; solids are editable inline, and every layer opens the full
 * FillPopover editor from its swatch. Add via the section "+", remove with the
 * minus, reorder by dragging the grip handle. Writes fan out over the selection.
 */
export function FillSection({ elements = [] }: FillSectionProps = {}) {
  const [paints, setPaints] = useState<BackgroundPaint[]>(() => [defaultSolid('050505')])
  const [shared, setShared] = useState<'single' | 'multiple'>('single')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  // Live drag-to-reorder state: `from` is the row picked up, `over` is the slot
  // it would drop into. Null when no drag is in progress.
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null)
  const anchorsRef = useRef<Record<number, HTMLElement | null>>({})

  useEffect(() => {
    if (elements.length === 0) return
    const sig = readShared(elements, el => paintsSignature(readPaints(el)))
    if (sig.kind === 'multiple') {
      setShared('multiple')
      setOpenIndex(null)
      return
    }
    setShared('single')
    setPaints(readPaints(elements[0]))
  }, [elements])

  /** Set the stack and write it to every selected element. */
  function apply(next: BackgroundPaint[]) {
    const stack = next.length ? next : [defaultSolid('', '0')]
    setShared('single')
    setPaints(stack)
    for (const { property, value } of paintsToStyles(stack)) {
      applyPatchAll(elements, { kind: 'setStyle', property, value })
    }
  }

  const updateLayer = (i: number, paint: BackgroundPaint) => apply(paints.map((p, j) => (j === i ? paint : p)))
  function removeLayer(i: number) {
    setOpenIndex(null)
    apply(paints.filter((_, j) => j !== i))
  }
  /** Begin a pointer drag on row `from` (the grip handle). Tracks the nearest
   *  row under the pointer as `over`, and on release moves the layer into that
   *  slot. Listens in capture so the edit-mode inert layer (which swallows
   *  page mouse events) can't eat the move/up. */
  function startDrag(from: number, e: React.PointerEvent) {
    e.preventDefault()
    setOpenIndex(null)
    setDrag({ from, over: from })

    const nearestRow = (clientY: number): number => {
      let best = from
      let bestDist = Infinity
      for (const [k, el] of Object.entries(anchorsRef.current)) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        const dist = Math.abs(clientY - (r.top + r.height / 2))
        if (dist < bestDist) { bestDist = dist; best = Number(k) }
      }
      return best
    }
    const onMove = (ev: PointerEvent) => setDrag(d => (d ? { ...d, over: nearestRow(ev.clientY) } : d))
    const onUp = () => {
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      setDrag(d => {
        if (d && d.from !== d.over) apply(moveItem(paints, d.from, d.over))
        return null
      })
    }
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
  }
  function addLayer() {
    const cleaned = paints.filter(p => !isBlank(p))
    apply([defaultSolid('CCCCCC', '100'), ...cleaned])
    setOpenIndex(0)
  }
  function onColorToken(i: number, token: Token) {
    // Single solid layer: keep the symbolic token binding via applyTokenAll and
    // re-read. Multi-layer: fall back to the resolved color on that layer.
    if (paints.length === 1 && i === 0) {
      applyPatchAll(elements, { kind: 'setStyle', property: 'background-image', value: '' })
      applyTokenAll(elements, 'background-color', token)
      setShared('single')
      if (elements[0]) setPaints(readPaints(elements[0]))
      return
    }
    const { hex, alphaPercent } = rgbStringToHexAlpha(token.value)
    updateLayer(i, { kind: 'solid', hex, alpha: alphaPercent })
  }

  const activeAnchor = {
    get current() {
      return openIndex != null ? anchorsRef.current[openIndex] ?? null : null
    },
  }

  const actions = (
    <IconButton title="Add background" onClick={addLayer}>{plusIcon}</IconButton>
  )

  return (
    <Section title="Background" actions={actions}>
      {shared === 'multiple' ? (
        <PaintRow
          hex=""
          hexPlaceholder={MULTIPLE_PLACEHOLDER}
          swatchColor="transparent"
          swatchBackground="transparent"
          alpha=""
          alphaPlaceholder="–"
          disabled
          hideVisibility
        />
      ) : (
        paints.map((p, i) => {
          const preview = paintToPreview(p)
          // Only a stack of 2+ layers is reorderable; a lone layer has nowhere
          // to go, so it shows no grip.
          const draggable = paints.length > 1
          const reorder = draggable
            ? { onDragHandleDown: (e: React.PointerEvent) => startDrag(i, e), isDragging: drag?.from === i }
            : {}
          // Show a drop indicator on the row the drag is currently over.
          const isDropTarget = drag != null && drag.over === i && drag.from !== i
          return (
            <div
              key={i}
              ref={el => { anchorsRef.current[i] = el }}
              style={{
                borderRadius: 4,
                boxShadow: isDropTarget ? `0 0 0 1.5px ${COLORS.accent}` : undefined,
              }}
            >
              {p.kind === 'solid' ? (
                <PaintRow
                  hex={p.hex}
                  swatchColor={`#${p.hex}`}
                  swatchBackground={preview}
                  alpha={p.alpha}
                  hideVisibility
                  onHexChange={v => updateLayer(i, { ...p, hex: normalizeHex(v) })}
                  onAlphaChange={v => updateLayer(i, { ...p, alpha: v })}
                  onSwatchClick={() => setOpenIndex(o => (o === i ? null : i))}
                  onRemove={() => removeLayer(i)}
                  {...reorder}
                  tokenProperty="background-color"
                  onTokenSelect={t => onColorToken(i, t)}
                />
              ) : (
                <PaintRow
                  label={p.kind === 'gradient' ? 'Gradient' : 'Image'}
                  swatchColor={preview}
                  swatchBackground={preview}
                  hideAlpha
                  hideToken
                  hideVisibility
                  onSwatchClick={() => setOpenIndex(o => (o === i ? null : i))}
                  onRemove={() => removeLayer(i)}
                  {...reorder}
                />
              )}
            </div>
          )
        })
      )}

      <FillPopover
        isOpen={openIndex != null && shared === 'single'}
        onClose={() => setOpenIndex(null)}
        anchorRef={activeAnchor}
        paint={openIndex != null ? paints[openIndex] ?? null : null}
        onPaintChange={p => { if (openIndex != null) updateLayer(openIndex, p) }}
        onTokenSelect={t => { if (openIndex != null) onColorToken(openIndex, t) }}
      />
    </Section>
  )
}
