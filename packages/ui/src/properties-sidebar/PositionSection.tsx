import { useEffect, useState } from 'react'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Row } from './Row'
import { Section } from './Section'
import { SegmentedButtonGroup } from './SegmentedButtonGroup'
import { applyPatchAll, MULTIPLE_PLACEHOLDER, readShared, sharedDisplayValue } from './read-shared'
import { useScrubbable } from './useScrubbable'
import { applyPatch } from '../edit/patch'
import { readPx, readRotationDeg } from '../edit/read-computed'

export interface PositionSectionProps {
  /** Source + matched-peer elements. `[]` means no selection; multi-edit fans
   *  out reads (via `readShared`) and writes (loop applyPatch) over the array. */
  elements?: Element[]
}

type HAlign = 'left' | 'center' | 'right'
type VAlign = 'top' | 'middle' | 'bottom'

/** True when the element's parent is an auto-layout container (flex/grid), so
 *  the child's X/Y is governed by the layout rather than free positioning. */
function parentIsAutoLayout(el: Element): boolean {
  const parent = el.parentElement
  if (!parent) return false
  const display = getComputedStyle(parent).display
  return display.includes('flex') || display.includes('grid')
}

/** True when the element opts out of its parent's auto layout via absolute
 *  positioning — Figma's "Ignore auto layout". */
function ignoresAutoLayout(el: Element): boolean {
  return getComputedStyle(el).position === 'absolute'
}

/** The element's current box, measured relative to its parent's content
 *  origin. Used to freeze geometry when converting an in-flow element to
 *  absolute so it visually stays put. */
function measureBox(el: Element): { left: number; top: number; width: number; height: number } {
  const rect = el.getBoundingClientRect()
  const parent = el.parentElement
  if (!parent) return { left: 0, top: 0, width: rect.width, height: rect.height }
  const pRect = parent.getBoundingClientRect()
  const ps = getComputedStyle(parent)
  return {
    left: rect.left - pRect.left - (parseFloat(ps.borderLeftWidth) || 0),
    top: rect.top - pRect.top - (parseFloat(ps.borderTopWidth) || 0),
    width: rect.width,
    height: rect.height,
  }
}

/** Reads the CSS `translate` property as an "x,y" pair of rounded px. */
function readTranslate(el: Element): string {
  const raw = getComputedStyle(el).translate
  if (!raw || raw === 'none') return '0,0'
  const parts = raw.split(/\s+/)
  const x = Math.round(parseFloat(parts[0]) || 0)
  const y = Math.round(parseFloat(parts[1] ?? '0') || 0)
  return `${x},${y}`
}

export function PositionSection({
  elements = [],
}: PositionSectionProps = {}) {
  const [hAlign, setHAlign] = useState<HAlign | null>(null)
  const [vAlign, setVAlign] = useState<VAlign | null>(null)
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [rotation, setRotation] = useState('0')
  const [rotationShared, setRotationShared] = useState<'single' | 'multiple'>('single')
  const [isConstrained, setIsConstrained] = useState(true)
  // Auto-layout context, collapsed across the selection: the toggle and the
  // X/Y disabling only apply when *every* selected element agrees.
  const [inAutoLayout, setInAutoLayout] = useState(false)
  const [isIgnoring, setIsIgnoring] = useState(false)
  // Optional translate offset, available for in-flow (non-absolute) elements.
  const [offsetOpen, setOffsetOpen] = useState(false)
  const [offsetX, setOffsetX] = useState('0')
  const [offsetY, setOffsetY] = useState('0')
  // Bumped after geometry-mutating actions (e.g. toggling absolute) so the X/Y
  // and offset reads below re-run even though the `elements` ref is unchanged.
  const [geomTick, setGeomTick] = useState(0)

  useEffect(() => {
    setInAutoLayout(elements.length > 0 && elements.every(parentIsAutoLayout))
    setIsIgnoring(elements.length > 0 && elements.every(ignoresAutoLayout))
  }, [elements])

  // X/Y mirror the element's `left`/`top`, which only take effect once the
  // element is absolutely positioned. The offset reads `translate`.
  useEffect(() => {
    if (elements.length === 0) {
      setX(''); setY('')
      setOffsetOpen(false); setOffsetX('0'); setOffsetY('0')
      return
    }
    const left = readShared(elements, el => readPx(el, 'left'))
    const top = readShared(elements, el => readPx(el, 'top'))
    setX(sharedDisplayValue(left))
    setY(sharedDisplayValue(top))

    const tr = readShared(elements, readTranslate)
    if (tr.kind === 'single') {
      const [ox, oy] = tr.value.split(',')
      setOffsetX(ox); setOffsetY(oy)
      setOffsetOpen(ox !== '0' || oy !== '0')
    } else {
      setOffsetX('0'); setOffsetY('0'); setOffsetOpen(false)
    }
  }, [elements, geomTick])

  // X/Y are governed by the layout while the element sits inside one and
  // hasn't opted out — matches Figma, where position is greyed out until you
  // toggle "Ignore auto layout".
  const positionDisabled = inAutoLayout && !isIgnoring

  function onToggleIgnore() {
    const next = !isIgnoring
    setIsIgnoring(next)
    if (next) {
      // Freeze each element's current box so it stays put when it leaves the
      // flow. The parent must be a containing block for left/top to resolve.
      for (const el of elements) {
        const box = measureBox(el)
        const parent = el.parentElement
        if (parent && getComputedStyle(parent).position === 'static') {
          applyPatch(parent, { kind: 'setStyle', property: 'position', value: 'relative' })
        }
        applyPatch(el, { kind: 'setStyle', property: 'position', value: 'absolute' })
        applyPatch(el, { kind: 'setStyle', property: 'left', value: `${Math.round(box.left)}px` })
        applyPatch(el, { kind: 'setStyle', property: 'top', value: `${Math.round(box.top)}px` })
        applyPatch(el, { kind: 'setStyle', property: 'width', value: `${Math.round(box.width)}px` })
        applyPatch(el, { kind: 'setStyle', property: 'height', value: `${Math.round(box.height)}px` })
      }
    } else {
      // Dropping back into the flow clears `position` only — the frozen
      // left/top/width/height are kept so the element's box is preserved.
      applyPatchAll(elements, { kind: 'setStyle', property: 'position', value: '' })
    }
    refreshGeometry()
  }

  // Re-read X/Y here and nudge sibling panels (the Layout pane listens for
  // `pixel-drag-frame`) so width/height stay in sync after the conversion.
  function refreshGeometry() {
    setGeomTick(t => t + 1)
    document.dispatchEvent(new Event('pixel-drag-frame'))
  }

  function onX(v: string) {
    setX(v)
    applyPatchAll(elements, { kind: 'setStyle', property: 'left', value: v ? `${v}px` : '' })
  }

  function onY(v: string) {
    setY(v)
    applyPatchAll(elements, { kind: 'setStyle', property: 'top', value: v ? `${v}px` : '' })
  }

  function applyOffset(ox: string, oy: string) {
    const x = ox === '' || ox === '-' ? '0' : ox
    const y = oy === '' || oy === '-' ? '0' : oy
    applyPatchAll(elements, { kind: 'setStyle', property: 'translate', value: `${x}px ${y}px` })
  }

  function onOffsetX(v: string) {
    setOffsetX(v)
    applyOffset(v, offsetY)
  }

  function onOffsetY(v: string) {
    setOffsetY(v)
    applyOffset(offsetX, v)
  }

  function onToggleOffset() {
    const next = !offsetOpen
    setOffsetOpen(next)
    if (!next) {
      setOffsetX('0'); setOffsetY('0')
      applyPatchAll(elements, { kind: 'setStyle', property: 'translate', value: '' })
    }
  }

  // Re-read rotation from the live elements on every change. In single-edit
  // (or when all matched elements agree) we display the value; otherwise we
  // surface "Multiple" so the designer knows values diverge.
  useEffect(() => {
    if (elements.length === 0) {
      setRotation('0')
      setRotationShared('single')
      return
    }
    const shared = readShared(elements, readRotationDeg)
    if (shared.kind === 'multiple') {
      setRotation('')
      setRotationShared('multiple')
    } else {
      setRotation(sharedDisplayValue(shared))
      setRotationShared('single')
    }
  }, [elements])

  function onRotation(v: string) {
    setRotation(v)
    setRotationShared('single')
    const n = parseFloat(v)
    const css = Number.isFinite(n) ? `rotate(${n}deg)` : ''
    for (const el of elements) {
      applyPatch(el, { kind: 'setStyle', property: 'transform', value: css })
    }
  }

  const scrubX = useScrubbable({ value: x, onChange: onX })
  const scrubY = useScrubbable({ value: y, onChange: onY })
  const scrubOffsetX = useScrubbable({ value: offsetX, onChange: onOffsetX })
  const scrubOffsetY = useScrubbable({ value: offsetY, onChange: onOffsetY })
  const scrubRotation = useScrubbable({
    value: rotation,
    onChange: onRotation,
    min: -360,
    max: 360,
  })

  return (
    <Section title="Position">
      <Row label="Alignment">
        <SegmentedButtonGroup
          value={hAlign}
          onChange={v => setHAlign(v as HAlign)}
          options={[
            { value: 'left', title: 'Align left', icon: alignHLeft },
            { value: 'center', title: 'Align horizontal center', icon: alignHCenter },
            { value: 'right', title: 'Align right', icon: alignHRight },
          ]}
        />
        <div style={{ width: 4 }} />
        <SegmentedButtonGroup
          value={vAlign}
          onChange={v => setVAlign(v as VAlign)}
          options={[
            { value: 'top', title: 'Align top', icon: alignVTop },
            { value: 'middle', title: 'Align vertical center', icon: alignVMiddle },
            { value: 'bottom', title: 'Align bottom', icon: alignVBottom },
          ]}
        />
        {inAutoLayout && (
          <>
            <div style={{ flex: 1 }} />
            <IconButton
              title="Set absolute position"
              isActive={isIgnoring}
              onClick={onToggleIgnore}
            >
              {ignoreAutoLayoutIcon}
            </IconButton>
          </>
        )}
      </Row>

      <Row label="Position">
        <NumericInput
          prefix="X"
          ariaLabel="X position"
          value={x}
          onChange={onX}
          disabled={positionDisabled}
          prefixProps={scrubX.prefixProps}
        />
        <NumericInput
          prefix="Y"
          ariaLabel="Y position"
          value={y}
          onChange={onY}
          disabled={positionDisabled}
          prefixProps={scrubY.prefixProps}
        />
        <IconButton
          title="Constrain proportions / absolute position"
          isActive={isConstrained}
          onClick={() => setIsConstrained(v => !v)}
        >
          {constrainIcon}
        </IconButton>
      </Row>

      {elements.length > 0 && !isIgnoring && (
        <Row label="Offset">
          {offsetOpen ? (
            <>
              <NumericInput
                prefix="X"
                ariaLabel="Offset X (translate)"
                value={offsetX}
                onChange={onOffsetX}
                prefixProps={scrubOffsetX.prefixProps}
              />
              <NumericInput
                prefix="Y"
                ariaLabel="Offset Y (translate)"
                value={offsetY}
                onChange={onOffsetY}
                prefixProps={scrubOffsetY.prefixProps}
              />
              <IconButton title="Remove offset" isActive onClick={onToggleOffset}>
                {offsetIcon}
              </IconButton>
            </>
          ) : (
            <IconButton title="Add offset (translate)" onClick={onToggleOffset}>
              {offsetIcon}
            </IconButton>
          )}
        </Row>
      )}

      <Row label="Rotation">
        <NumericInput
          prefix={rotationPrefix}
          suffix={rotationShared === 'multiple' ? '' : '°'}
          ariaLabel="Rotation"
          value={rotation}
          placeholder={rotationShared === 'multiple' ? MULTIPLE_PLACEHOLDER : ''}
          disabled={rotationShared === 'multiple'}
          onChange={onRotation}
          prefixProps={scrubRotation.prefixProps}
        />
        <IconButton title="Rotate">{rotateIcon}</IconButton>
        <IconButton title="Flip horizontal">{flipHIcon}</IconButton>
        <IconButton title="Flip vertical">{flipVIcon}</IconButton>
      </Row>
    </Section>
  )
}

// -- Inlined icon markup -----------------------------------------------------
// Kept as JSX values (not components) so we stay within one-component-per-file.

const alignHLeft = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="2" width="1.25" height="12" rx="0.4" />
    <rect x="4.5" y="3.5" width="9" height="3" rx="0.5" />
    <rect x="4.5" y="9.5" width="5.5" height="3" rx="0.5" />
  </svg>
)

const alignHCenter = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="7.375" y="2" width="1.25" height="12" rx="0.4" />
    <rect x="3" y="3.5" width="10" height="3" rx="0.5" />
    <rect x="5.25" y="9.5" width="5.5" height="3" rx="0.5" />
  </svg>
)

const alignHRight = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="12.75" y="2" width="1.25" height="12" rx="0.4" />
    <rect x="2.5" y="3.5" width="9" height="3" rx="0.5" />
    <rect x="6" y="9.5" width="5.5" height="3" rx="0.5" />
  </svg>
)

const alignVTop = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="2" width="12" height="1.25" rx="0.4" />
    <rect x="3.5" y="4.5" width="3" height="9" rx="0.5" />
    <rect x="9.5" y="4.5" width="3" height="5.5" rx="0.5" />
  </svg>
)

const alignVMiddle = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="7.375" width="12" height="1.25" rx="0.4" />
    <rect x="3.5" y="3" width="3" height="10" rx="0.5" />
    <rect x="9.5" y="5.25" width="3" height="5.5" rx="0.5" />
  </svg>
)

const alignVBottom = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2" y="12.75" width="12" height="1.25" rx="0.4" />
    <rect x="3.5" y="2.5" width="3" height="9" rx="0.5" />
    <rect x="9.5" y="6" width="3" height="5.5" rx="0.5" />
  </svg>
)

// Four-way arrows — nudging the element from its in-flow position via translate.
const offsetIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
    <path d="M 6 4.5 L 8 2.5 L 10 4.5" />
    <path d="M 6 11.5 L 8 13.5 L 10 11.5" />
    <path d="M 4.5 6 L 2.5 8 L 4.5 10" />
    <path d="M 11.5 6 L 13.5 8 L 11.5 10" />
  </svg>
)

// A dashed frame with a small solid child pinned to a corner — signals that
// the child is positioned freely, ignoring the parent's auto layout.
const ignoreAutoLayoutIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25">
    <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" strokeDasharray="2 1.5" />
    <rect x="4.5" y="4.5" width="4" height="4" rx="0.5" fill="currentColor" stroke="none" />
  </svg>
)

const constrainIcon = (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
  >
    <line x1="3.5" y1="3" x2="3.5" y2="13" />
    <line x1="12.5" y1="3" x2="12.5" y2="13" />
    <line x1="6" y1="8" x2="10" y2="8" />
    <line x1="8" y1="6" x2="8" y2="10" />
  </svg>
)

const rotationPrefix = (
  <svg
    viewBox="0 0 12 12"
    width="12"
    height="12"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.1"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M 2.5 2 L 2.5 9.5 L 10 9.5" />
    <path d="M 5.5 4 A 3 3 0 0 1 8.5 7" />
  </svg>
)

const rotateIcon = (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M 13 8 A 5 5 0 1 1 8 3" />
    <polyline points="8 1.5 8 4 10.5 4" />
  </svg>
)

const flipHIcon = (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="2.5" x2="8" y2="13.5" strokeDasharray="1.2 1.8" />
    <path d="M 6 5 L 3 8 L 6 11" />
    <path d="M 10 5 L 13 8 L 10 11" />
  </svg>
)

const flipVIcon = (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="2.5" y1="8" x2="13.5" y2="8" strokeDasharray="1.2 1.8" />
    <path d="M 5 6 L 8 3 L 11 6" />
    <path d="M 5 10 L 8 13 L 11 10" />
  </svg>
)
