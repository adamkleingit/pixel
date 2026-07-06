import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconButton } from './IconButton'
import { NumericInput } from './NumericInput'
import { Row } from './Row'
import { Section } from './Section'
import { SegmentedButtonGroup } from './SegmentedButtonGroup'
import { tokenDisplayLabel } from './token-mapping'
import { COLORS, SIZES, Z_INDEX } from './tokens'
import { checkIcon, lockIcon } from './icons'
import type { Token } from '../pixel-common'
import { applyPatchAll, applyTokenAll, MULTIPLE_PLACEHOLDER, readShared } from './read-shared'
import { OWN_UI_PROPS } from '../own-ui'
import { useScrubbable, type ScrubExtras, type ScrubModifiers, type SnapTarget } from './useScrubbable'
import { useTokenMatch } from './useTokenMatch'
import { mirrorPropertiesFor } from '../drag/spacing-mirror'
import { readRaw } from '../edit/read-computed'
import { readExplicit } from '../edit/read-explicit'

export interface LayoutSectionProps {
  /** Source + matched-peer elements. Reads collapse via `readSharedField`;
   *  edits fan out across all of them. */
  elements?: Element[]
}

type SizeAxis = 'width' | 'height'

/**
 * The container's display mode, mirroring Figma's auto-layout "Flow":
 *  - `none`       → element removed from layout (`display: none`)
 *  - `natural`    → regular HTML flow (`display: block`)
 *  - `horizontal` → flex row    (`display: flex; flex-direction: row`)
 *  - `vertical`   → flex column (`display: flex; flex-direction: column`)
 *  - `grid`       → CSS grid    (`display: grid`) — selectable, but the
 *    grid-specific track controls are not built yet.
 *  - `freeform`   → children are absolutely positioned; the container becomes
 *    their positioning context (`position: relative`).
 *
 * Each mode owns all three properties below so switching is fully
 * round-trippable: `position` is cleared except in `freeform`, which is the
 * inverse of the per-child "Ignore auto layout" toggle in PositionSection.
 */
type Flow = 'none' | 'natural' | 'horizontal' | 'vertical' | 'grid' | 'freeform'

const FLOW_CSS: Record<Flow, { display: string; flexDirection: string; position: string }> = {
  none:       { display: 'none',  flexDirection: '',       position: ''         },
  natural:    { display: 'block', flexDirection: '',       position: ''         },
  horizontal: { display: 'flex',  flexDirection: 'row',    position: ''         },
  vertical:   { display: 'flex',  flexDirection: 'column', position: ''         },
  grid:       { display: 'grid',  flexDirection: '',       position: ''         },
  freeform:   { display: 'block', flexDirection: '',       position: 'relative' },
}

function readFlow(el: Element): Flow {
  const cs = getComputedStyle(el)
  if (cs.display === 'none') return 'none'
  if (cs.display.includes('grid')) return 'grid'
  if (cs.display.includes('flex')) {
    return cs.flexDirection.startsWith('column') ? 'vertical' : 'horizontal'
  }
  if (cs.position === 'relative') return 'freeform'
  return 'natural'
}

// -- Flex alignment / gap / wrap ---------------------------------------------
// Shown only for flex flows. The 3×3 alignment grid maps a visual (h, v) cell
// onto `justify-content` (main axis) + `align-items` (cross axis), accounting
// for direction so the grid always reads as the designer sees it on canvas.

type FlexDir = 'row' | 'column'
type AlignKey = 'start' | 'center' | 'end'
type SpreadMode = 'space-between' | 'space-around' | 'space-evenly'
/** The main-axis distribution: either clustered (start/center/end) or one of
 *  the "auto gap" spread modes that distribute children across the axis. */
type MainMode = AlignKey | SpreadMode

const ALIGN_INDEX: AlignKey[] = ['start', 'center', 'end']
const SPREAD_MODES: SpreadMode[] = ['space-between', 'space-around', 'space-evenly']
/** Left→right order for dragging the gap through the spread modes: least spread
 *  (space-evenly) on the left, most spread (space-between) on the right. */
const SPREAD_ORDER: SpreadMode[] = ['space-evenly', 'space-around', 'space-between']

const SPREAD_LABEL: Record<SpreadMode, string> = {
  'space-between': 'Space between',
  'space-around': 'Space around',
  'space-evenly': 'Space evenly',
}

function isSpread(mode: MainMode | null): mode is SpreadMode {
  return mode === 'space-between' || mode === 'space-around' || mode === 'space-evenly'
}

function alignToFlex(a: AlignKey): string {
  return a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : 'center'
}

function normalizeAlign(value: string): AlignKey {
  if (value.includes('center')) return 'center'
  if (value.includes('end')) return 'end'
  return 'start'
}

/** Collapse a computed `justify-content` to a MainMode (spread or clustered). */
function normalizeMain(value: string): MainMode {
  if (value.includes('between')) return 'space-between'
  if (value.includes('around')) return 'space-around'
  if (value.includes('evenly')) return 'space-evenly'
  return normalizeAlign(value)
}

function readJustify(el: Element): string {
  return getComputedStyle(el).justifyContent
}

function readAlignItems(el: Element): string {
  return getComputedStyle(el).alignItems
}

function readFlexWrap(el: Element): string {
  return getComputedStyle(el).flexWrap
}

const FIELD_LABEL_STYLE = {
  fontSize: 11,
  color: COLORS.label,
  letterSpacing: '0.01em',
} as const

type BoxProperty =
  | 'width' | 'height'
  | 'min-width' | 'max-width' | 'min-height' | 'max-height'
  | 'padding-top' | 'padding-right' | 'padding-bottom' | 'padding-left'
  | 'margin-top' | 'margin-right' | 'margin-bottom' | 'margin-left'

type FieldState = { value: string; placeholder: string }

const EMPTY_FIELD: FieldState = { value: '', placeholder: '' }
const MULTIPLE_FIELD: FieldState = { value: '', placeholder: MULTIPLE_PLACEHOLDER }

const BOX_PROPERTIES: BoxProperty[] = [
  'width', 'height',
  'min-width', 'max-width', 'min-height', 'max-height',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
]

function readField(el: Element, property: string): FieldState {
  // Preserve the authored unit (px/%/em/rem/auto). Explicit value first, else
  // the computed value as a dimmed placeholder.
  const explicit = readExplicit(el, property)
  if (explicit.source !== null) return { value: explicit.value, placeholder: '' }
  return { value: '', placeholder: readRaw(el, property) }
}

/** Collapse `readField` across the element set: same → that field, different
 *  → the "Multiple" placeholder. Compares both `value` (explicit) and
 *  `placeholder` (computed) so a mix of explicit + inherited still surfaces. */
function readSharedField(elements: Element[], property: string): FieldState {
  if (elements.length === 0) return EMPTY_FIELD
  const first = readField(elements[0], property)
  const firstKey = `${first.value}|${first.placeholder}`
  for (let i = 1; i < elements.length; i++) {
    const f = readField(elements[i], property)
    if (`${f.value}|${f.placeholder}` !== firstKey) return MULTIPLE_FIELD
  }
  return first
}

export function LayoutSection({ elements = [] }: LayoutSectionProps = {}) {
  const [flow, setFlow] = useState<Flow | null>(null)
  const [fields, setFields] = useState<Record<BoxProperty, FieldState>>(() => emptyFields())
  const [isLocked, setIsLocked] = useState(false)
  // Flex-only controls (alignment grid, per-axis gap, wrap). Populated by the
  // effect below only while `flow` is a flex direction.
  const [wrap, setWrap] = useState(false)
  // Main-axis distribution + cross-axis alignment, kept separate so the grid
  // can show a clustered cell or a whole spread band. `null` = "Multiple".
  const [justify, setJustify] = useState<MainMode | null>(null)
  const [crossAlign, setCrossAlign] = useState<AlignKey | null>(null)
  const [gapPrimary, setGapPrimary] = useState<FieldState>(EMPTY_FIELD)
  const [gapCounter, setGapCounter] = useState<FieldState>(EMPTY_FIELD)

  const isFlex = flow === 'horizontal' || flow === 'vertical'
  const dir: FlexDir = flow === 'vertical' ? 'column' : 'row'
  // In a row, items flow along the main (horizontal) axis → primary gap is the
  // column-gap; the cross-axis (between wrapped rows) is row-gap. Swapped for a
  // column.
  const gapPrimaryProp = dir === 'row' ? 'column-gap' : 'row-gap'
  const gapCounterProp = dir === 'row' ? 'row-gap' : 'column-gap'
  // Bumps on every silent drag patch so the inputs track the element live
  // while the user resizes from the canvas. See tech-specs/drag-to-resize.md §8.
  const [dragTick, setDragTick] = useState(0)

  useEffect(() => {
    function bump() { setDragTick(t => t + 1) }
    document.addEventListener('pixel-drag-frame', bump)
    return () => document.removeEventListener('pixel-drag-frame', bump)
  }, [])

  useEffect(() => {
    if (elements.length === 0) { setFlow(null); return }
    const shared = readShared(elements, readFlow)
    setFlow(shared.kind === 'single' ? (shared.value as Flow) : null)
  }, [elements])

  useEffect(() => {
    const flex = flow === 'horizontal' || flow === 'vertical'
    if (elements.length === 0 || !flex) {
      setJustify(null); setCrossAlign(null); setWrap(false)
      setGapPrimary(EMPTY_FIELD); setGapCounter(EMPTY_FIELD)
      return
    }
    const jc = readShared(elements, readJustify)
    setJustify(jc.kind === 'single' ? normalizeMain(jc.value) : null)
    const ai = readShared(elements, readAlignItems)
    setCrossAlign(ai.kind === 'single' ? normalizeAlign(ai.value) : null)
    const w = readShared(elements, readFlexWrap)
    setWrap(w.kind === 'single' && w.value.startsWith('wrap'))
    setGapPrimary(readSharedField(elements, gapPrimaryProp))
    setGapCounter(readSharedField(elements, gapCounterProp))
  }, [elements, flow, gapPrimaryProp, gapCounterProp])

  useEffect(() => {
    if (elements.length === 0) { setFields(emptyFields()); return }
    const next = {} as Record<BoxProperty, FieldState>
    for (const p of BOX_PROPERTIES) next[p] = readSharedField(elements, p)
    setFields(next)
    // `dragTick` keeps inputs in sync per-frame during canvas resize drags
    // (tech-specs/drag-to-resize.md §8). `elements` covers re-selection and
    // multi-edit peer changes from main.
  }, [elements, dragTick])

  function onFlow(next: Flow) {
    setFlow(next)
    const css = FLOW_CSS[next]
    applyPatchAll(elements, { kind: 'setStyle', property: 'display', value: css.display })
    applyPatchAll(elements, { kind: 'setStyle', property: 'flex-direction', value: css.flexDirection })
    applyPatchAll(elements, { kind: 'setStyle', property: 'position', value: css.position })
  }

  function onWrap() {
    const next = !wrap
    setWrap(next)
    applyPatchAll(elements, { kind: 'setStyle', property: 'flex-wrap', value: next ? 'wrap' : '' })
  }

  // The grid's main axis is horizontal for a row, vertical for a column. So a
  // cell's main-axis index is its column (h) for rows, its row (v) for columns;
  // the cross-axis index is the other one.
  function cellAxes(h: number, v: number) {
    return dir === 'row' ? { main: h, cross: v } : { main: v, cross: h }
  }

  function writeAlign(mainJustify: string, crossKey: AlignKey) {
    applyPatchAll(elements, { kind: 'setStyle', property: 'justify-content', value: mainJustify })
    applyPatchAll(elements, { kind: 'setStyle', property: 'align-items', value: alignToFlex(crossKey) })
  }

  // Click behaviour is mode-sensitive. The grid acts as a *band picker* while
  // spread is active — clicking only switches the cross-axis band, keeping the
  // current space-between / -around / -evenly mode. Double-click is the toggle
  // between modes. So:
  //
  //   Cluster (numeric gap)            Spread (auto gap)
  //   ---------------------            ---------------------
  //   click  → cluster at cell         click  → change band, keep spread mode
  //   dblclk → spread the band         dblclk → cluster at cell (exit spread)
  function onAlign(h: number, v: number) {
    const { main, cross } = cellAxes(h, v)
    const crossKey = ALIGN_INDEX[cross]
    if (isSpread(justify)) {
      // Band-only update — leave justify-content (the spread mode) untouched.
      setCrossAlign(crossKey)
      applyPatchAll(elements, {
        kind: 'setStyle',
        property: 'align-items',
        value: alignToFlex(crossKey),
      })
      return
    }
    const mainKey = ALIGN_INDEX[main]
    setJustify(mainKey)
    setCrossAlign(crossKey)
    writeAlign(alignToFlex(mainKey), crossKey)
  }

  function onAlignSpread(h: number, v: number) {
    const { main, cross } = cellAxes(h, v)
    const crossKey = ALIGN_INDEX[cross]
    if (isSpread(justify)) {
      // Double-click while already spread → flip back to a clustered cell at
      // the clicked location. Gap returns to numeric (whatever the current
      // explicit value is, typically 0 since spread had cleared it).
      const mainKey = ALIGN_INDEX[main]
      setJustify(mainKey)
      setCrossAlign(crossKey)
      writeAlign(alignToFlex(mainKey), crossKey)
      return
    }
    // Enter spread mode. Default to space-between; gap auto.
    const mode: SpreadMode = 'space-between'
    setJustify(mode)
    setCrossAlign(crossKey)
    writeAlign(mode, crossKey)
    setGapPrimary(EMPTY_FIELD)
    applyPatchAll(elements, { kind: 'setStyle', property: gapPrimaryProp, value: '' })
  }

  function onDistribute(mode: string) {
    setJustify(mode as SpreadMode)
    applyPatchAll(elements, { kind: 'setStyle', property: 'justify-content', value: mode })
    applyPatchAll(elements, { kind: 'setStyle', property: gapPrimaryProp, value: '' })
  }

  // Exit a spread mode back to a clustered (numeric-gap) layout. Picked from
  // the gap dropdown's "Custom value" option — counterpart to single-clicking
  // an alignment cell, which also clusters. We fall back to flex-start so the
  // alignment grid lights up in a predictable position and the gap input
  // becomes editable again.
  function onCustomGap() {
    setJustify('start')
    applyPatchAll(elements, { kind: 'setStyle', property: 'justify-content', value: 'flex-start' })
  }

  /** Convert an automatic (spread) gap into an explicit px gap: leave the spread
   *  distribution for a clustered flex-start and write the pixel value. Used by
   *  the gap prefix's ⌘-drag — "set a pixel value and it actually sets that,
   *  instead of staying on the automatic value". */
  function onGapToPixel(px: number) {
    setJustify('start')
    applyPatchAll(elements, { kind: 'setStyle', property: 'justify-content', value: 'flex-start' })
    onGap(gapPrimaryProp, String(px))
  }

  /** Update either gap field's display value from a written property name —
   *  needed so an alt-mirror write of column-gap also refreshes the row-gap
   *  input (and vice versa). Unknown property = no-op. */
  function setGapField(prop: string, v: string) {
    if (prop === gapPrimaryProp) setGapPrimary(f => ({ value: v, placeholder: f.placeholder }))
    else if (prop === gapCounterProp) setGapCounter(f => ({ value: v, placeholder: f.placeholder }))
  }

  // Snap targets / typed-value matcher for every spacing-kind input (padding,
  // margin, gap, sizing). One tokenMatch instance is enough: `useTokenMatch`
  // resolves the kind via `tokenKindForProperty`, and every spacing/size prop
  // maps to the same `'spacing'` kind, so the targets list is identical.
  const spacingMatch = useTokenMatch('padding-top')

  /** Resolve the right "preferred token" for a write: snap takes precedence,
   *  then exact-typed match against the formatted px value. */
  function resolveSpacingToken(v: string, extras?: ScrubExtras): Token | null {
    if (extras?.snappedToken) return extras.snappedToken
    return spacingMatch.matchToken(withUnit(v))
  }

  /** Common write path for either gap input — expands through the mirror set
   *  so alt-scrub on row-gap also writes column-gap (and refreshes its field). */
  function onGap(sourceProp: string, v: string, mods?: ScrubModifiers, extras?: ScrubExtras) {
    const properties = mods ? mirrorPropertiesFor(sourceProp, mods.alt, mods.shift) : [sourceProp]
    const token = resolveSpacingToken(v, extras)
    for (const p of properties) {
      setGapField(p, v)
      if (token) {
        applyTokenAll(elements, p, token)
      } else {
        applyPatchAll(elements, { kind: 'setStyle', property: p, value: withUnit(v) })
      }
    }
  }

  function onGapPrimary(v: string, mods?: ScrubModifiers, extras?: ScrubExtras) { onGap(gapPrimaryProp, v, mods, extras) }
  function onGapCounter(v: string, mods?: ScrubModifiers, extras?: ScrubExtras) { onGap(gapCounterProp, v, mods, extras) }

  function onChange(property: BoxProperty, v: string, mods?: ScrubModifiers, extras?: ScrubExtras) {
    // `mirrorPropertiesFor` returns `[property]` for non-spacing props (width,
    // height) so the same path handles every box dimension. Modifiers are only
    // passed by the scrubbable path — typed-text edits arrive without `mods`
    // and therefore never mirror, which matches Figma.
    const properties = mods ? mirrorPropertiesFor(property, mods.alt, mods.shift) : [property]
    const token = resolveSpacingToken(v, extras)
    setFields(prev => {
      const next = { ...prev }
      for (const p of properties) {
        if (p in next) next[p as BoxProperty] = { value: v, placeholder: next[p as BoxProperty].placeholder }
      }
      return next
    })
    for (const p of properties) {
      if (token) {
        applyTokenAll(elements, p, token)
      } else {
        applyPatchAll(elements, { kind: 'setStyle', property: p, value: withUnit(v) })
      }
    }
  }

  /** Switch a dimension to Auto. We write the explicit value `auto` (rather
   *  than clearing inline) so the override survives any stylesheet width/height. */
  function onSetAuto(axis: SizeAxis) {
    setFields(prev => ({ ...prev, [axis]: { value: '', placeholder: prev[axis].placeholder } }))
    applyPatchAll(elements, { kind: 'setStyle', property: axis, value: 'auto' })
  }

  /** Promote an Auto axis to Fixed at the current resolved px. */
  function onSetFixed(axis: SizeAxis) {
    const current = fields[axis].value || fields[axis].placeholder || '0'
    setFields(prev => ({ ...prev, [axis]: { value: current, placeholder: '' } }))
    applyPatchAll(elements, { kind: 'setStyle', property: axis, value: `${current}px` })
  }

  /** Add a min-/max- limit by seeding it at the current resolved dimension. */
  function onAddLimit(kind: 'min' | 'max', axis: SizeAxis) {
    const property = `${kind}-${axis}` as BoxProperty
    const current = fields[axis].value || fields[axis].placeholder || '0'
    setFields(prev => ({ ...prev, [property]: { value: current, placeholder: '' } }))
    applyPatchAll(elements, { kind: 'setStyle', property, value: `${current}px` })
  }

  function onRemoveLimit(kind: 'min' | 'max', axis: SizeAxis) {
    const property = `${kind}-${axis}` as BoxProperty
    setFields(prev => ({ ...prev, [property]: { value: '', placeholder: prev[property].placeholder } }))
    applyPatchAll(elements, { kind: 'setStyle', property, value: '' })
  }

  function onSetLimitToCurrent(kind: 'min' | 'max', axis: SizeAxis) {
    // Reuses the same path as Add — overwrites the existing limit with the
    // axis's current resolved px.
    onAddLimit(kind, axis)
  }

  return (
    <Section title="Layout">
      <Row label="Display">
        <SegmentedButtonGroup
          value={flow}
          onChange={v => onFlow(v as Flow)}
          options={[
            { value: 'none', title: 'None (display: none)', icon: flowNoneIcon },
            { value: 'natural', title: 'Natural (HTML flow)', icon: flowNaturalIcon },
            { value: 'horizontal', title: 'Horizontal (flex row)', icon: flowHorizontalIcon },
            { value: 'vertical', title: 'Vertical (flex column)', icon: flowVerticalIcon },
            { value: 'grid', title: 'Grid', icon: flowGridIcon },
            { value: 'freeform', title: 'Freeform (absolute)', icon: flowFreeformIcon },
          ]}
        />
        {isFlex && (
          <>
            <div style={{ flex: 1 }} />
            <IconButton title="Wrap" isActive={wrap} onClick={onWrap}>
              {wrapIcon}
            </IconButton>
          </>
        )}
      </Row>

      <Row label="Dimensions">
        <SizeField
          axis="width"
          field={fields.width}
          minField={fields['min-width']}
          maxField={fields['max-width']}
          onChange={(v, m) => onChange('width', v, m)}
          onSetAuto={() => onSetAuto('width')}
          onSetFixed={() => onSetFixed('width')}
          onAddLimit={kind => onAddLimit(kind, 'width')}
          onRemoveLimit={kind => onRemoveLimit(kind, 'width')}
        />
        <SizeField
          axis="height"
          field={fields.height}
          minField={fields['min-height']}
          maxField={fields['max-height']}
          onChange={(v, m) => onChange('height', v, m)}
          onSetAuto={() => onSetAuto('height')}
          onSetFixed={() => onSetFixed('height')}
          onAddLimit={kind => onAddLimit(kind, 'height')}
          onRemoveLimit={kind => onRemoveLimit(kind, 'height')}
        />
        <IconButton
          title="Lock aspect ratio"
          isActive={isLocked}
          onClick={() => setIsLocked(v => !v)}
        >
          {lockIcon}
        </IconButton>
      </Row>

      {(fields['min-width'].value !== '' || fields['min-height'].value !== '') && (
        <Row label="Min size">
          {fields['min-width'].value !== '' ? (
            <LimitField
              kind="min"
              axis="width"
              field={fields['min-width']}
              currentValue={fields.width.value || fields.width.placeholder}
              onChange={(v, m) => onChange('min-width', v, m)}
              onSetToCurrent={() => onSetLimitToCurrent('min', 'width')}
              onRemove={() => onRemoveLimit('min', 'width')}
            />
          ) : <span style={{ flex: 1 }} />}
          {fields['min-height'].value !== '' ? (
            <LimitField
              kind="min"
              axis="height"
              field={fields['min-height']}
              currentValue={fields.height.value || fields.height.placeholder}
              onChange={(v, m) => onChange('min-height', v, m)}
              onSetToCurrent={() => onSetLimitToCurrent('min', 'height')}
              onRemove={() => onRemoveLimit('min', 'height')}
            />
          ) : <span style={{ flex: 1 }} />}
          <span style={{ width: SIZES.iconButton }} />
        </Row>
      )}

      {(fields['max-width'].value !== '' || fields['max-height'].value !== '') && (
        <Row label="Max size">
          {fields['max-width'].value !== '' ? (
            <LimitField
              kind="max"
              axis="width"
              field={fields['max-width']}
              currentValue={fields.width.value || fields.width.placeholder}
              onChange={(v, m) => onChange('max-width', v, m)}
              onSetToCurrent={() => onSetLimitToCurrent('max', 'width')}
              onRemove={() => onRemoveLimit('max', 'width')}
            />
          ) : <span style={{ flex: 1 }} />}
          {fields['max-height'].value !== '' ? (
            <LimitField
              kind="max"
              axis="height"
              field={fields['max-height']}
              currentValue={fields.height.value || fields.height.placeholder}
              onChange={(v, m) => onChange('max-height', v, m)}
              onSetToCurrent={() => onSetLimitToCurrent('max', 'height')}
              onRemove={() => onRemoveLimit('max', 'height')}
            />
          ) : <span style={{ flex: 1 }} />}
          <span style={{ width: SIZES.iconButton }} />
        </Row>
      )}

      {isFlex && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={FIELD_LABEL_STYLE}>Alignment</div>
          <div
            role="group"
            aria-label="Alignment"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 18px)',
              gridTemplateRows: 'repeat(3, 18px)',
              background: COLORS.input,
              borderRadius: 4,
              padding: 2,
              alignSelf: 'flex-start',
            }}
          >
            {[0, 1, 2].map(v =>
              [0, 1, 2].map(h => {
                const { main, cross } = cellAxes(h, v)
                const crossIdx = crossAlign ? ALIGN_INDEX.indexOf(crossAlign) : -1
                const onCrossBand = cross === crossIdx
                // A clustered cell lights only its own cell; a spread mode
                // lights the whole band sharing the cross-axis alignment.
                const active = isSpread(justify)
                  ? onCrossBand
                  : onCrossBand && justify !== null && main === ALIGN_INDEX.indexOf(justify)
                return (
                  <button
                    key={`${h}-${v}`}
                    type="button"
                    aria-label={`Align ${ALIGN_INDEX[h]} ${ALIGN_INDEX[v]}`}
                    title="Click to align · double-click to distribute"
                    onClick={() => onAlign(h, v)}
                    onDoubleClick={() => onAlignSpread(h, v)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <span
                      style={{
                        // Bars run along the cross axis (perpendicular to the
                        // flow), like Figma's item glyphs.
                        width: active ? (dir === 'row' ? 2.5 : 9) : 3,
                        height: active ? (dir === 'row' ? 9 : 2.5) : 3,
                        borderRadius: active ? 1.25 : '50%',
                        background: active ? COLORS.accentLight : COLORS.muted,
                      }}
                    />
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {isFlex && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={FIELD_LABEL_STYLE}>Gap</div>
          <GapField
            mode={justify && isSpread(justify) ? justify : 'numeric'}
            field={gapPrimary}
            onNumeric={onGapPrimary}
            onSpread={onDistribute}
            onCustom={onCustomGap}
            onToPixel={onGapToPixel}
            snapTargets={spacingMatch.snapTargets}
            tokenLabel={tokenLabelFor(gapPrimary.value, spacingMatch)}
          />
          {wrap && (
            <DimensionInput
              prefix={gapCrossIcon}
              ariaLabel="Cross-axis gap"
              field={gapCounter}
              onChange={onGapCounter}
              snapTargets={spacingMatch.snapTargets}
              tokenLabel={tokenLabelFor(gapCounter.value, spacingMatch)}
            />
          )}
        </div>
      )}

      <Row label="Padding">
        <DimensionInput prefix="T" ariaLabel="Padding top"    field={fields['padding-top']}    onChange={(v, m, e) => onChange('padding-top', v, m, e)}    snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['padding-top'].value, spacingMatch)} />
        <DimensionInput prefix="R" ariaLabel="Padding right"  field={fields['padding-right']}  onChange={(v, m, e) => onChange('padding-right', v, m, e)}  snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['padding-right'].value, spacingMatch)} />
        <DimensionInput prefix="B" ariaLabel="Padding bottom" field={fields['padding-bottom']} onChange={(v, m, e) => onChange('padding-bottom', v, m, e)} snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['padding-bottom'].value, spacingMatch)} />
        <DimensionInput prefix="L" ariaLabel="Padding left"   field={fields['padding-left']}   onChange={(v, m, e) => onChange('padding-left', v, m, e)}   snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['padding-left'].value, spacingMatch)} />
      </Row>

      <Row label="Margin">
        <DimensionInput prefix="T" ariaLabel="Margin top"    field={fields['margin-top']}    onChange={(v, m, e) => onChange('margin-top', v, m, e)}    snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['margin-top'].value, spacingMatch)} />
        <DimensionInput prefix="R" ariaLabel="Margin right"  field={fields['margin-right']}  onChange={(v, m, e) => onChange('margin-right', v, m, e)}  snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['margin-right'].value, spacingMatch)} />
        <DimensionInput prefix="B" ariaLabel="Margin bottom" field={fields['margin-bottom']} onChange={(v, m, e) => onChange('margin-bottom', v, m, e)} snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['margin-bottom'].value, spacingMatch)} />
        <DimensionInput prefix="L" ariaLabel="Margin left"   field={fields['margin-left']}   onChange={(v, m, e) => onChange('margin-left', v, m, e)}   snapTargets={spacingMatch.snapTargets} tokenLabel={tokenLabelFor(fields['margin-left'].value, spacingMatch)} />
      </Row>
    </Section>
  )
}

function emptyFields(): Record<BoxProperty, FieldState> {
  const out = {} as Record<BoxProperty, FieldState>
  for (const p of BOX_PROPERTIES) out[p] = EMPTY_FIELD
  return out
}

/** Token label for a spacing input — `value` already carries its unit. */
function tokenLabelFor(value: string, match: ReturnType<typeof useTokenMatch>): string | null {
  if (!value) return null
  return tokenDisplayLabel(match.matchToken(withUnit(value)))
}

/** Default a bare number to `px`; pass through values that already carry a unit
 *  or keyword. Lets the unit-aware padding/margin inputs and the px-oriented
 *  width/height/gap inputs share one write path. */
function withUnit(v: string): string {
  const t = (v ?? '').trim()
  if (t === '') return ''
  return /[a-z%]/i.test(t) ? t : `${t}px`
}

interface DimensionInputProps {
  prefix: ReactNode
  ariaLabel: string
  field: FieldState
  /** Scrubbable path receives modifier state + snap-extras; typed-text edits
   *  call without those and therefore never mirror or token-bind via snap
   *  (they still bind via the parent's exact-value match). */
  onChange: (value: string, mods?: ScrubModifiers, extras?: ScrubExtras) => void
  /** Snap targets for this input's kind. Empty array disables snap. */
  snapTargets?: SnapTarget[]
  /** Live token label when the current value coincides with a token. */
  tokenLabel?: string | null
}

// Padding/margin live four-to-a-row, too tight for a per-cell unit dropdown, so
// these keep the plain numeric input. A typed unit (e.g. `2em`) is still honored
// — the parent's `withUnit` write only defaults a *bare* number to px.
function DimensionInput({
  prefix,
  ariaLabel,
  field,
  onChange,
  snapTargets,
  tokenLabel = null,
}: DimensionInputProps) {
  const scrub = useScrubbable({
    value: field.value || field.placeholder,
    onChange,
    min: 0,
    snap: snapTargets && snapTargets.length > 0 ? { targets: snapTargets, threshold: 3 } : undefined,
  })
  const isMultiple = field.placeholder === MULTIPLE_PLACEHOLDER
  return (
    <NumericInput
      prefix={prefix}
      ariaLabel={ariaLabel}
      value={field.value}
      placeholder={field.placeholder}
      disabled={isMultiple}
      onChange={onChange}
      prefixProps={scrub.prefixProps}
      tokenLabel={tokenLabel}
    />
  )
}

// -- GapField ----------------------------------------------------------------
// Unified gap control. Same chrome at all times — gap icon, value area,
// chevron — so the dropdown is always reachable. Two modes:
//   `numeric`     → the value area is an editable px input (DimensionInput-like).
//   spread-* (3)  → the value area shows the spread-mode label, click-to-open.
// The dropdown menu lists the three spread modes always, plus a "Custom value"
// item *only* in spread mode (its only job is to flip back to numeric). Numeric
// mode reaches spread modes via the same menu, so the gap and the alignment
// grid are interchangeable entry points to distribution mode.

type GapMode = 'numeric' | SpreadMode

interface GapFieldProps {
  mode: GapMode
  field: FieldState
  onNumeric: (value: string, mods?: ScrubModifiers, extras?: ScrubExtras) => void
  onSpread: (mode: SpreadMode) => void
  onCustom: () => void
  /** Convert the automatic (spread) gap into an explicit px gap (⌘-drag). */
  onToPixel: (px: number) => void
  snapTargets?: SnapTarget[]
  tokenLabel?: string | null
}

/** px of horizontal drag per step when cycling the spread modes. */
const SPREAD_DRAG_STEP = 26

function GapField({
  mode,
  field,
  onNumeric,
  onSpread,
  onCustom,
  onToPixel,
  snapTargets,
  tokenLabel = null,
}: GapFieldProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)
  const spreadActive = mode !== 'numeric'
  const isMultiple = field.placeholder === MULTIPLE_PLACEHOLDER
  // Always create the scrub binding so hook order stays stable. In spread mode
  // we drive the prefix with the spread-drag handlers below instead.
  const scrub = useScrubbable({
    value: field.value || field.placeholder,
    onChange: onNumeric,
    min: 0,
    snap: snapTargets && snapTargets.length > 0 ? { targets: snapTargets, threshold: 3 } : undefined,
  })

  // Dragging the prefix while the gap is on an automatic (spread) value cycles
  // through the spread modes — space-evenly (left) → space-around → space-between
  // (right). Holding ⌘/Ctrl instead converts it to an explicit px gap and scrubs
  // that. `dragActive` keeps our handlers attached across the spread→pixel
  // switch (which flips `mode` to 'numeric' mid-drag) so the gesture stays ours
  // until pointer-up.
  const [dragActive, setDragActive] = useState(false)
  const spreadDrag = useRef<{ x: number; startIndex: number } | null>(null)
  const spreadPrefixProps: HTMLAttributes<HTMLSpanElement> = {
    onPointerDown: (e) => {
      if (e.button !== 0) return
      spreadDrag.current = {
        x: e.clientX,
        startIndex: Math.max(0, SPREAD_ORDER.indexOf(mode as SpreadMode)),
      }
      setDragActive(true)
      e.currentTarget.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    onPointerMove: (e) => {
      const d = spreadDrag.current
      if (!d) return
      const dx = e.clientX - d.x
      if (e.metaKey || e.ctrlKey) {
        // ⌘-drag → explicit px gap (scrubbed from 0, since spread cleared it).
        onToPixel(Math.max(0, Math.round(dx)))
        return
      }
      const idx = Math.max(0, Math.min(SPREAD_ORDER.length - 1, d.startIndex + Math.round(dx / SPREAD_DRAG_STEP)))
      const next = SPREAD_ORDER[idx]
      if (next !== mode) onSpread(next)
    },
    onPointerUp: (e) => {
      spreadDrag.current = null
      setDragActive(false)
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    },
    onPointerCancel: (e) => {
      spreadDrag.current = null
      setDragActive(false)
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    },
    style: { cursor: 'ew-resize', touchAction: 'none', userSelect: 'none' },
  }
  // Use the spread-drag handlers whenever the gap is automatic, and keep them
  // through an in-progress ⌘-drag conversion; otherwise the numeric scrubber.
  const useSpreadDrag = spreadActive || dragActive
  const prefixProps = useSpreadDrag ? spreadPrefixProps : scrub.prefixProps

  // Mirror Dropdown's portal positioning: open below the trigger, flip up if
  // it would overflow the viewport.
  useLayoutEffect(() => {
    if (!open) return
    function update() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      const margin = 8
      const menuW = Math.max(r.width, menuRef.current?.offsetWidth ?? r.width)
      const menuH = menuRef.current?.offsetHeight ?? 0
      let left = r.left
      let top = r.bottom + 4
      if (menuH > 0 && top + menuH > vh - margin) {
        top = r.top - menuH - 4
        if (top < margin) top = margin
      }
      if (left + menuW > vw - margin) left = vw - menuW - margin
      if (left < margin) left = margin
      setPos({ left, top, width: r.width })
    }
    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleMouse(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handleMouse)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleMouse)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open])

  const itemStyle = (active: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    border: 'none',
    background: active ? COLORS.inputActive : 'transparent',
    color: COLORS.text,
    fontSize: 12,
    textAlign: 'left',
    cursor: 'pointer',
    borderRadius: 4,
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  })

  const menu = open && pos
    ? createPortal(
        <div
          ref={menuRef}
          {...OWN_UI_PROPS}
          style={{
            position: 'fixed',
            left: pos.left,
            top: pos.top,
            minWidth: pos.width,
            background: COLORS.panel,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 6,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            padding: 4,
            zIndex: Z_INDEX.popover,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {SPREAD_MODES.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { onSpread(m); setOpen(false) }}
              style={itemStyle(mode === m)}
            >
              {SPREAD_LABEL[m]}
            </button>
          ))}
          {spreadActive && (
            <>
              <div style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />
              <button
                type="button"
                onClick={() => { onCustom(); setOpen(false) }}
                style={itemStyle(false)}
              >
                Custom value
              </button>
            </>
          )}
        </div>,
        document.body,
      )
    : null

  return (
    <div
      ref={triggerRef}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        height: SIZES.rowHeight,
        padding: '0 8px',
        background: COLORS.input,
        borderRadius: 4,
        color: COLORS.text,
        fontSize: 12,
      }}
    >
      <span
        {...prefixProps}
        aria-label={spreadActive ? 'Drag to change gap distribution' : 'Drag to change gap'}
        style={{
          color: COLORS.muted,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 12,
          flexShrink: 0,
          ...(prefixProps.style ?? {}),
        }}
      >
        {gapMainIcon}
      </span>
      {spreadActive ? (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-label="Distribution mode"
          style={{
            flex: 1,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            padding: 0,
            color: COLORS.text,
            fontSize: 12,
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {SPREAD_LABEL[mode]}
        </button>
      ) : (
        <>
          <input
            type="text"
            value={field.value}
            placeholder={field.placeholder}
            disabled={isMultiple}
            onChange={e => onNumeric(e.target.value)}
            aria-label="Gap between items"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: COLORS.text,
              fontSize: 12,
              padding: 0,
              fontFamily: 'inherit',
              cursor: isMultiple ? 'not-allowed' : 'text',
            }}
          />
          {tokenLabel && (
            <span
              title={`Bound to token: ${tokenLabel}`}
              style={{
                color: COLORS.accent,
                fontSize: 11,
                flexShrink: 0,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                maxWidth: 80,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                marginRight: 4,
              }}
            >
              {tokenLabel}
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label="Open gap menu"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          color: COLORS.muted,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
        }}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
          <path d="M 2 4 L 5 7 L 8 4 Z" />
        </svg>
      </button>
      {menu}
    </div>
  )
}

// -- Menu primitives ---------------------------------------------------------
// Small shared chrome for the W/H/Min/Max dropdowns. Same portal-positioning
// approach as GapField; pulled out so SizeField and LimitField can reuse the
// outside-click + escape + flip-up plumbing without copy-pasting it.

interface MenuPopoverProps {
  triggerRef: { current: HTMLElement | null }
  open: boolean
  onClose: () => void
  children: ReactNode
}

function MenuPopover({ triggerRef, open, onClose, children }: MenuPopoverProps) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    function update() {
      const el = triggerRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const vw = window.innerWidth, vh = window.innerHeight
      const margin = 8
      const menuW = Math.max(r.width, menuRef.current?.offsetWidth ?? r.width)
      const menuH = menuRef.current?.offsetHeight ?? 0
      let left = r.left
      let top = r.bottom + 4
      if (menuH > 0 && top + menuH > vh - margin) {
        top = r.top - menuH - 4
        if (top < margin) top = margin
      }
      if (left + menuW > vw - margin) left = vw - menuW - margin
      if (left < margin) left = margin
      setPos({ left, top, width: r.width })
    }
    update()
    const raf = requestAnimationFrame(update)
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open, triggerRef])

  useEffect(() => {
    if (!open) return
    function handleMouse(e: MouseEvent) {
      const t = e.target as Node
      if (menuRef.current?.contains(t)) return
      if (triggerRef.current?.contains(t)) return
      onClose()
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', handleMouse)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleMouse)
      window.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose, triggerRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={menuRef}
      {...OWN_UI_PROPS}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        minWidth: pos.width,
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 6,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        padding: 4,
        zIndex: Z_INDEX.popover,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}

function MenuItem({
  active = false,
  onClick,
  children,
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 8px',
        border: 'none',
        background: active ? COLORS.inputActive : 'transparent',
        color: COLORS.text,
        fontSize: 12,
        textAlign: 'left',
        cursor: 'pointer',
        borderRadius: 4,
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ display: 'inline-flex', width: 14, justifyContent: 'center', color: COLORS.muted }}>
        {active ? checkIcon : null}
      </span>
      <span>{children}</span>
    </button>
  )
}

function MenuDivider() {
  return <div style={{ height: 1, background: COLORS.border, margin: '4px 0' }} />
}

// -- SizeField ---------------------------------------------------------------
// Width / height input with a Figma-style mode dropdown:
//   Fixed (N) · Auto · Add/Remove min · Add/Remove max
// `field.value === ''` means Auto (no inline value); the placeholder still
// holds the resolved computed px and is shown as a muted read-only value.

interface SizeFieldProps {
  axis: SizeAxis
  field: FieldState
  minField: FieldState
  maxField: FieldState
  onChange: (value: string, mods?: ScrubModifiers) => void
  onSetAuto: () => void
  onSetFixed: () => void
  onAddLimit: (kind: 'min' | 'max') => void
  onRemoveLimit: (kind: 'min' | 'max') => void
}

function SizeField({
  axis,
  field,
  minField,
  maxField,
  onChange,
  onSetAuto,
  onSetFixed,
  onAddLimit,
  onRemoveLimit,
}: SizeFieldProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const isAuto = field.value === ''
  const isMultiple = field.placeholder === MULTIPLE_PLACEHOLDER
  const prefix = axis === 'width' ? 'W' : 'H'
  const label = axis === 'width' ? 'width' : 'height'
  const scrub = useScrubbable({ value: field.value || field.placeholder, onChange, min: 0 })
  const hasMin = minField.value !== ''
  const hasMax = maxField.value !== ''
  const currentDisplay = field.value || field.placeholder || '0'

  return (
    <div ref={triggerRef} style={fieldShellStyle}>
      <span
        {...(isMultiple || isAuto ? {} : scrub.prefixProps)}
        style={{
          ...fieldPrefixStyle,
          ...(isMultiple || isAuto ? {} : scrub.prefixProps.style ?? {}),
        }}
      >
        {prefix}
      </span>
      {isAuto ? (
        <span
          style={{
            flex: 1,
            minWidth: 0,
            color: COLORS.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {field.placeholder || '—'}
        </span>
      ) : (
        <input
          type="text"
          value={field.value}
          placeholder={field.placeholder}
          disabled={isMultiple}
          onChange={e => onChange(e.target.value)}
          aria-label={label}
          style={fieldInputStyle(isMultiple)}
        />
      )}
      {isAuto && (
        <span style={{ fontSize: 11, color: COLORS.muted, flexShrink: 0 }}>Auto</span>
      )}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`${label} options`}
        style={fieldChevronStyle}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
          <path d="M 2 4 L 5 7 L 8 4 Z" />
        </svg>
      </button>
      <MenuPopover triggerRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <MenuItem active={!isAuto} onClick={() => { onSetFixed(); setOpen(false) }}>
          Fixed {label} ({currentDisplay})
        </MenuItem>
        <MenuItem active={isAuto} onClick={() => { onSetAuto(); setOpen(false) }}>
          Auto
        </MenuItem>
        <MenuDivider />
        {hasMin ? (
          <MenuItem onClick={() => { onRemoveLimit('min'); setOpen(false) }}>
            Remove min {label}
          </MenuItem>
        ) : (
          <MenuItem onClick={() => { onAddLimit('min'); setOpen(false) }}>
            Add min {label}…
          </MenuItem>
        )}
        {hasMax ? (
          <MenuItem onClick={() => { onRemoveLimit('max'); setOpen(false) }}>
            Remove max {label}
          </MenuItem>
        ) : (
          <MenuItem onClick={() => { onAddLimit('max'); setOpen(false) }}>
            Add max {label}…
          </MenuItem>
        )}
      </MenuPopover>
    </div>
  )
}

// -- LimitField --------------------------------------------------------------
// Min/max width or height. Slim cousin of SizeField: numeric input + chevron
// with a tiny "Set to current N · Remove min/max N" menu.

interface LimitFieldProps {
  kind: 'min' | 'max'
  axis: SizeAxis
  field: FieldState
  /** Current resolved value of the axis — shown as the seed in "Set to current". */
  currentValue: string
  onChange: (value: string, mods?: ScrubModifiers) => void
  onSetToCurrent: () => void
  onRemove: () => void
}

function LimitField({
  kind,
  axis,
  field,
  currentValue,
  onChange,
  onSetToCurrent,
  onRemove,
}: LimitFieldProps) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const isMultiple = field.placeholder === MULTIPLE_PLACEHOLDER
  const prefix = `${kind === 'min' ? 'Min' : 'Max'} ${axis === 'width' ? 'W' : 'H'}`
  const label = `${kind === 'min' ? 'min' : 'max'} ${axis}`
  const scrub = useScrubbable({ value: field.value || field.placeholder, onChange, min: 0 })

  return (
    <div ref={triggerRef} style={fieldShellStyle}>
      <span
        {...(isMultiple ? {} : scrub.prefixProps)}
        style={{
          ...fieldPrefixStyle,
          width: 28,
          ...(isMultiple ? {} : scrub.prefixProps.style ?? {}),
        }}
      >
        {prefix}
      </span>
      <input
        type="text"
        value={field.value}
        placeholder={field.placeholder}
        disabled={isMultiple}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        style={fieldInputStyle(isMultiple)}
      />
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`${label} options`}
        style={fieldChevronStyle}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor">
          <path d="M 2 4 L 5 7 L 8 4 Z" />
        </svg>
      </button>
      <MenuPopover triggerRef={triggerRef} open={open} onClose={() => setOpen(false)}>
        <MenuItem onClick={() => { onSetToCurrent(); setOpen(false) }}>
          Set to current {axis} ({currentValue || '0'})
        </MenuItem>
        <MenuItem onClick={() => { onRemove(); setOpen(false) }}>
          Remove {label}
        </MenuItem>
      </MenuPopover>
    </div>
  )
}

// Shared styles for the size/limit/gap field shells.
const fieldShellStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  height: SIZES.rowHeight,
  padding: '0 8px',
  background: COLORS.input,
  borderRadius: 4,
  color: COLORS.text,
  fontSize: 12,
}

const fieldPrefixStyle: CSSProperties = {
  color: COLORS.muted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 14,
  fontSize: 11,
  flexShrink: 0,
}

function fieldInputStyle(disabled: boolean): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: COLORS.text,
    fontSize: 12,
    padding: 0,
    fontFamily: 'inherit',
    cursor: disabled ? 'not-allowed' : 'text',
  }
}

const fieldChevronStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: COLORS.muted,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  flexShrink: 0,
}

// -- Flow icons --------------------------------------------------------------
// Inlined JSX values (matching the resizing icons below) so we keep one
// component per file while mirroring Figma's auto-layout flow glyphs.

const flowNoneIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4">
    <rect x="3.25" y="3.25" width="9.5" height="9.5" rx="1.5" />
  </svg>
)

const flowNaturalIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="3" y="3.5" width="10" height="1.6" rx="0.5" />
    <rect x="3" y="7.2" width="10" height="1.6" rx="0.5" />
    <rect x="3" y="10.9" width="6" height="1.6" rx="0.5" />
  </svg>
)

const flowHorizontalIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="3" y="4" width="2.5" height="8" rx="0.6" />
    <rect x="6.75" y="4" width="2.5" height="8" rx="0.6" />
    <rect x="10.5" y="4" width="2.5" height="8" rx="0.6" />
  </svg>
)

const flowVerticalIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="4" y="3" width="8" height="2.5" rx="0.6" />
    <rect x="4" y="6.75" width="8" height="2.5" rx="0.6" />
    <rect x="4" y="10.5" width="8" height="2.5" rx="0.6" />
  </svg>
)

const flowGridIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="3" y="3" width="4.5" height="4.5" rx="0.8" />
    <rect x="8.5" y="3" width="4.5" height="4.5" rx="0.8" />
    <rect x="3" y="8.5" width="4.5" height="4.5" rx="0.8" />
    <rect x="8.5" y="8.5" width="4.5" height="4.5" rx="0.8" />
  </svg>
)

const flowFreeformIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor">
    <rect x="2.5" y="3" width="4" height="4" rx="0.8" />
    <rect x="9" y="5.5" width="4.5" height="4.5" rx="0.8" />
    <rect x="4" y="9.5" width="3.5" height="3.5" rx="0.8" />
  </svg>
)

const wrapIcon = (
  <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 3 4.5 L 11 4.5 A 2.5 2.5 0 0 1 11 9.5 L 5.5 9.5" />
    <path d="M 7.5 7.5 L 5.5 9.5 L 7.5 11.5" />
  </svg>
)

// Two bars with the gap running along the main axis (between items)…
const gapMainIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
    <rect x="2" y="2.5" width="2.2" height="7" rx="0.5" />
    <rect x="7.8" y="2.5" width="2.2" height="7" rx="0.5" />
  </svg>
)

// …and stacked bars for the cross-axis gap (between wrapped lines).
const gapCrossIcon = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor">
    <rect x="2.5" y="2" width="7" height="2.2" rx="0.5" />
    <rect x="2.5" y="7.8" width="7" height="2.2" rx="0.5" />
  </svg>
)

