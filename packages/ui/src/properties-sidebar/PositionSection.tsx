import { useEffect, useState } from 'react'
import { DimensionInput } from './DimensionInput'
import { Dropdown } from './Dropdown'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Row } from './Row'
import { Section } from './Section'
import { applyPatchAll, MULTIPLE_PLACEHOLDER, readShared, sharedDisplayValue } from './read-shared'
import { useScrubbable } from './useScrubbable'
import { applyPatch } from '../edit/patch'
import { readPx, readRaw, readRotationDeg } from '../edit/read-computed'
import { readExplicit } from '../edit/read-explicit'
import { LENGTH_OPTIONS } from '../edit/dimension'

export interface PositionSectionProps {
  /** Source + matched-peer elements. `[]` means no selection; multi-edit fans
   *  out reads (via `readShared`) and writes (loop applyPatch) over the array. */
  elements?: Element[]
}

/** The three CSS positioning modes the section exposes. `none` = static (the
 *  element flows normally and X/Y are inert, so they're hidden). `relative`
 *  offsets the element from its normal slot; `absolute` takes it out of flow. */
type PositionMode = 'none' | 'relative' | 'absolute'

const POSITION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'relative', label: 'Relative' },
  { value: 'absolute', label: 'Absolute' },
]

/** Collapse a computed `position` to one of the three modes we offer. */
function readMode(el: Element): PositionMode {
  const p = getComputedStyle(el).position
  if (p === 'absolute' || p === 'fixed') return 'absolute'
  if (p === 'relative') return 'relative'
  return 'none'
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

export function PositionSection({
  elements = [],
}: PositionSectionProps = {}) {
  const [mode, setMode] = useState<PositionMode>('none')
  const [modeShared, setModeShared] = useState<'single' | 'multiple'>('single')
  const [x, setX] = useState('')
  const [y, setY] = useState('')
  const [rotation, setRotation] = useState('0')
  const [rotationShared, setRotationShared] = useState<'single' | 'multiple'>('single')
  // Bumped after geometry-mutating actions (e.g. switching mode) so the reads
  // below re-run even though the `elements` ref is unchanged.
  const [geomTick, setGeomTick] = useState(0)

  // Re-read the positioning mode + X/Y (left/top) from the live elements. X/Y
  // only mean anything once the element is positioned, so they're read (and
  // shown) only for relative/absolute.
  useEffect(() => {
    if (elements.length === 0) {
      setMode('none'); setModeShared('single')
      setX(''); setY('')
      return
    }
    const sharedMode = readShared(elements, readMode)
    if (sharedMode.kind === 'multiple') {
      setModeShared('multiple')
      setX(''); setY('')
      return
    }
    const m = (sharedMode.kind === 'single' ? sharedMode.value : 'none') as PositionMode
    setMode(m); setModeShared('single')
    if (m === 'none') {
      setX(''); setY('')
    } else {
      setX(sharedDisplayValue(readShared(elements, el => readExplicit(el, 'left').value || readRaw(el, 'left'))))
      setY(sharedDisplayValue(readShared(elements, el => readExplicit(el, 'top').value || readRaw(el, 'top'))))
    }
  }, [elements, geomTick])

  // Re-read X/Y (and nudge sibling panels that listen for `pixel-drag-frame`, so
  // width/height stay in sync) after a mode switch changes the box.
  function refreshGeometry() {
    setGeomTick(t => t + 1)
    document.dispatchEvent(new Event('pixel-drag-frame'))
  }

  function onModeChange(nextRaw: string) {
    const next = nextRaw as PositionMode
    setMode(next)
    setModeShared('single')
    if (next === 'none') {
      // Back to static; clear the now-inert offsets so a later re-enable starts
      // from a clean slate rather than surfacing stale left/top.
      applyPatchAll(elements, { kind: 'setStyle', property: 'position', value: '' })
      applyPatchAll(elements, { kind: 'setStyle', property: 'left', value: '' })
      applyPatchAll(elements, { kind: 'setStyle', property: 'top', value: '' })
    } else if (next === 'relative') {
      // Relative keeps the element in flow; left/top become offsets from its
      // normal slot (0,0 = no visual change), so there's no box to freeze.
      applyPatchAll(elements, { kind: 'setStyle', property: 'position', value: 'relative' })
    } else {
      // Absolute removes the element from flow. Freeze each element's current
      // box so it stays put, making the parent a containing block if it isn't.
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
    }
    refreshGeometry()
  }

  // `v` carries its unit (composed by DimensionInput) — write it as-is.
  function onX(v: string) {
    setX(v)
    applyPatchAll(elements, { kind: 'setStyle', property: 'left', value: v })
  }

  function onY(v: string) {
    setY(v)
    applyPatchAll(elements, { kind: 'setStyle', property: 'top', value: v })
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

  const scrubRotation = useScrubbable({
    value: rotation,
    onChange: onRotation,
    min: -360,
    max: 360,
  })

  const positioned = modeShared === 'single' && mode !== 'none'

  return (
    <Section title="Position">
      <Row label="Position">
        <Dropdown
          value={modeShared === 'multiple' ? '' : mode}
          placeholder={modeShared === 'multiple' ? MULTIPLE_PLACEHOLDER : undefined}
          onChange={onModeChange}
          options={POSITION_OPTIONS}
        />
      </Row>

      {positioned && (
        <Row>
          <DimensionInput
            prefix="X"
            ariaLabel="X position"
            value={x}
            onChange={onX}
            options={LENGTH_OPTIONS}
          />
          <DimensionInput
            prefix="Y"
            ariaLabel="Y position"
            value={y}
            onChange={onY}
            options={LENGTH_OPTIONS}
          />
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
