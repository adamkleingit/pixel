/**
 * DesignSections — a lean, self-contained design-properties panel, ported in
 * spirit from Pixel's properties sidebar (Layout / Typography / Appearance
 * sections). Unlike Pixel's canvas-coupled version, this reads the *live*
 * element's computed styles directly and writes through the in-app
 * `useEditHistory` change tracker:
 *
 *   - while editing (typing in a text input, dragging a range/color picker) we
 *     `applyLive` for instant preview, recording nothing;
 *   - on commit (blur for text inputs, change for selects/color pickers) we
 *     `commit([{ target, kind:'style', name, before, after }], name)` so the
 *     gesture becomes one reversible history entry.
 *
 * `before` is captured at focus (text inputs) or read fresh from the live DOM
 * at the moment of the committing change (selects / color pickers), so undo
 * always restores exactly what was there before this control touched it.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useEditHistory } from '../edit/edit-history'

export interface DesignSectionsProps {
  /** The live element whose computed styles are read and edited. */
  element: HTMLElement
}

interface SelectOption {
  value: string
  label: string
}

// -- Option lists ------------------------------------------------------------

const DISPLAY_OPTIONS: SelectOption[] = [
  { value: 'block', label: 'block' },
  { value: 'inline', label: 'inline' },
  { value: 'inline-block', label: 'inline-block' },
  { value: 'flex', label: 'flex' },
  { value: 'inline-flex', label: 'inline-flex' },
  { value: 'grid', label: 'grid' },
  { value: 'none', label: 'none' },
]

const FLEX_DIRECTION_OPTIONS: SelectOption[] = [
  { value: 'row', label: 'row' },
  { value: 'row-reverse', label: 'row-reverse' },
  { value: 'column', label: 'column' },
  { value: 'column-reverse', label: 'column-reverse' },
]

const JUSTIFY_OPTIONS: SelectOption[] = [
  { value: 'flex-start', label: 'flex-start' },
  { value: 'center', label: 'center' },
  { value: 'flex-end', label: 'flex-end' },
  { value: 'space-between', label: 'space-between' },
  { value: 'space-around', label: 'space-around' },
  { value: 'space-evenly', label: 'space-evenly' },
]

const ALIGN_OPTIONS: SelectOption[] = [
  { value: 'stretch', label: 'stretch' },
  { value: 'flex-start', label: 'flex-start' },
  { value: 'center', label: 'center' },
  { value: 'flex-end', label: 'flex-end' },
  { value: 'baseline', label: 'baseline' },
]

const FONT_WEIGHT_OPTIONS: SelectOption[] = [
  { value: 'normal', label: 'normal' },
  { value: 'bold', label: 'bold' },
  { value: '100', label: '100' },
  { value: '200', label: '200' },
  { value: '300', label: '300' },
  { value: '400', label: '400' },
  { value: '500', label: '500' },
  { value: '600', label: '600' },
  { value: '700', label: '700' },
  { value: '800', label: '800' },
  { value: '900', label: '900' },
]

const TEXT_ALIGN_OPTIONS: SelectOption[] = [
  { value: 'left', label: 'left' },
  { value: 'center', label: 'center' },
  { value: 'right', label: 'right' },
  { value: 'justify', label: 'justify' },
]

const BORDER_STYLE_OPTIONS: SelectOption[] = [
  { value: 'none', label: 'none' },
  { value: 'solid', label: 'solid' },
  { value: 'dashed', label: 'dashed' },
  { value: 'dotted', label: 'dotted' },
  { value: 'double', label: 'double' },
  { value: 'groove', label: 'groove' },
  { value: 'ridge', label: 'ridge' },
  { value: 'inset', label: 'inset' },
  { value: 'outset', label: 'outset' },
]

// -- Color helpers -----------------------------------------------------------

/**
 * Coerce an arbitrary CSS color string (rgb/rgba/named/hex) into a `#rrggbb`
 * value for `<input type="color">`, which only understands 7-char hex. Falls
 * back to black when the value can't be parsed (e.g. `transparent`, gradients).
 */
function toHexColor(value: string): string {
  const v = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return (
      '#' +
      v
        .slice(1)
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    )
  }
  const m = /^rgba?\(([^)]+)\)$/i.exec(v)
  if (m) {
    const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
    if (parts.length >= 3 && parts.slice(0, 3).every((n) => Number.isFinite(n))) {
      const hex = parts
        .slice(0, 3)
        .map((n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0'))
        .join('')
      return '#' + hex
    }
  }
  return '#000000'
}

// -- Live-read hook ----------------------------------------------------------

/**
 * Returns a function that reads a fresh computed value for `element`, plus a
 * `tick` that bumps whenever `element` changes so consumers re-read. We read
 * lazily (not snapshot all properties up front) to keep this lean.
 */
function useComputedReader(element: HTMLElement) {
  const read = useCallback(
    (name: string): string => getComputedStyle(element).getPropertyValue(name).trim(),
    [element],
  )
  return read
}

// -- Section + Row chrome ----------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screenshare-ds-section">
      <div className="screenshare-ds-section-title">{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="screenshare-ds-row">
      <label className="screenshare-ds-label">{label}</label>
      <div className="screenshare-ds-control">{children}</div>
    </div>
  )
}

// -- Text input control ------------------------------------------------------
// Free-form CSS value input. Captures `before` on focus, previews live on
// input, commits one reversible entry on blur (only if the value changed).

interface TextControlProps {
  element: HTMLElement
  property: string
  /** The current computed value, used to (re)seed the input when element changes. */
  initial: string
}

function TextControl({ element, property, initial }: TextControlProps) {
  const history = useEditHistory()
  const [value, setValue] = useState(initial)
  const beforeRef = useRef<string>(initial)

  // Reseed when the underlying element / read value changes from outside.
  useEffect(() => {
    setValue(initial)
  }, [initial])

  const onFocus = useCallback(() => {
    // Capture the value currently on the live DOM as the undo target.
    beforeRef.current = getComputedStyle(element).getPropertyValue(property).trim()
  }, [element, property])

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setValue(next)
      history.applyLive(element, 'style', property, next)
    },
    [element, history, property],
  )

  const onBlur = useCallback(() => {
    const before = beforeRef.current
    const after = value.trim()
    if (after === before) return
    history.commit([{ target: element, kind: 'style', name: property, before, after }], property)
  }, [element, history, property, value])

  return (
    <input
      type="text"
      className="screenshare-ds-input"
      value={value}
      onFocus={onFocus}
      onChange={onChange}
      onBlur={onBlur}
      spellCheck={false}
    />
  )
}

// -- Select control ----------------------------------------------------------
// Enum properties. Reads `before` fresh from the DOM and commits immediately on
// change (no separate live phase needed).

interface SelectControlProps {
  element: HTMLElement
  property: string
  options: SelectOption[]
  /** Current computed value used to set the selected option. */
  current: string
}

function SelectControl({ element, property, options, current }: SelectControlProps) {
  const history = useEditHistory()

  // If the computed value isn't one of our options, fall back to '' so the
  // native select shows a blank-but-valid state rather than mis-selecting.
  const selected = options.some((o) => o.value === current) ? current : ''

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const after = e.target.value
      const before = getComputedStyle(element).getPropertyValue(property).trim()
      if (after === before) return
      history.commit([{ target: element, kind: 'style', name: property, before, after }], property)
    },
    [element, history, property],
  )

  return (
    <select className="screenshare-ds-select" value={selected} onChange={onChange}>
      {selected === '' && <option value="" disabled hidden />}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

// -- Color control -----------------------------------------------------------
// A free-form text input (any CSS color) plus a native color swatch. The text
// input behaves like TextControl; the swatch commits on change.

interface ColorControlProps {
  element: HTMLElement
  property: string
  initial: string
}

function ColorControl({ element, property, initial }: ColorControlProps) {
  const history = useEditHistory()
  const [value, setValue] = useState(initial)
  const beforeRef = useRef<string>(initial)

  useEffect(() => {
    setValue(initial)
  }, [initial])

  const onTextFocus = useCallback(() => {
    beforeRef.current = getComputedStyle(element).getPropertyValue(property).trim()
  }, [element, property])

  const onTextChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setValue(next)
      history.applyLive(element, 'style', property, next)
    },
    [element, history, property],
  )

  const onTextBlur = useCallback(() => {
    const before = beforeRef.current
    const after = value.trim()
    if (after === before) return
    history.commit([{ target: element, kind: 'style', name: property, before, after }], property)
  }, [element, history, property, value])

  // The picker previews live as it slides (input) and commits on change.
  const pickerBeforeRef = useRef<string>(initial)
  const onPickerInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value
      setValue(next)
      history.applyLive(element, 'style', property, next)
    },
    [element, history, property],
  )
  const onPickerFocus = useCallback(() => {
    pickerBeforeRef.current = getComputedStyle(element).getPropertyValue(property).trim()
  }, [element, property])
  const onPickerChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const before = pickerBeforeRef.current
      const after = e.target.value
      if (after === before) return
      history.commit([{ target: element, kind: 'style', name: property, before, after }], property)
    },
    [element, history, property],
  )

  return (
    <div className="screenshare-ds-color">
      <input
        type="color"
        className="screenshare-ds-swatch"
        value={toHexColor(value)}
        onFocus={onPickerFocus}
        onInput={onPickerInput}
        onChange={onPickerChange}
      />
      <input
        type="text"
        className="screenshare-ds-input"
        value={value}
        onFocus={onTextFocus}
        onChange={onTextChange}
        onBlur={onTextBlur}
        spellCheck={false}
      />
    </div>
  )
}

// -- Main component ----------------------------------------------------------

export function DesignSections({ element }: DesignSectionsProps) {
  const read = useComputedReader(element)

  // Re-read all displayed values when the element identity changes. We keep a
  // single snapshot object so each control receives a stable `initial`/`current`
  // string and reseeds via its own effect.
  const values = useMemo(() => {
    const get = (name: string) => getComputedStyle(element).getPropertyValue(name).trim()
    return {
      display: get('display'),
      width: get('width'),
      height: get('height'),
      padding: get('padding'),
      margin: get('margin'),
      gap: get('gap'),
      flexDirection: get('flex-direction'),
      justifyContent: get('justify-content'),
      alignItems: get('align-items'),
      fontSize: get('font-size'),
      fontWeight: get('font-weight'),
      lineHeight: get('line-height'),
      letterSpacing: get('letter-spacing'),
      textAlign: get('text-align'),
      color: get('color'),
      backgroundColor: get('background-color'),
      borderWidth: get('border-width') || get('border-top-width'),
      borderStyle: get('border-style') || get('border-top-style'),
      borderColor: get('border-color') || get('border-top-color'),
      borderRadius: get('border-radius'),
      opacity: get('opacity'),
      boxShadow: get('box-shadow'),
    }
    // `read` carries the element identity; re-run when it changes.
  }, [read, element])

  return (
    <div className="screenshare-ds-root">
      <Section title="Layout">
        <Row label="Display">
          <SelectControl element={element} property="display" options={DISPLAY_OPTIONS} current={values.display} />
        </Row>
        <Row label="Width">
          <TextControl element={element} property="width" initial={values.width} />
        </Row>
        <Row label="Height">
          <TextControl element={element} property="height" initial={values.height} />
        </Row>
        <Row label="Padding">
          <TextControl element={element} property="padding" initial={values.padding} />
        </Row>
        <Row label="Margin">
          <TextControl element={element} property="margin" initial={values.margin} />
        </Row>
        <Row label="Gap">
          <TextControl element={element} property="gap" initial={values.gap} />
        </Row>
        <Row label="Direction">
          <SelectControl
            element={element}
            property="flex-direction"
            options={FLEX_DIRECTION_OPTIONS}
            current={values.flexDirection}
          />
        </Row>
        <Row label="Justify">
          <SelectControl
            element={element}
            property="justify-content"
            options={JUSTIFY_OPTIONS}
            current={values.justifyContent}
          />
        </Row>
        <Row label="Align">
          <SelectControl
            element={element}
            property="align-items"
            options={ALIGN_OPTIONS}
            current={values.alignItems}
          />
        </Row>
      </Section>

      <Section title="Typography">
        <Row label="Font size">
          <TextControl element={element} property="font-size" initial={values.fontSize} />
        </Row>
        <Row label="Weight">
          <SelectControl
            element={element}
            property="font-weight"
            options={FONT_WEIGHT_OPTIONS}
            current={values.fontWeight}
          />
        </Row>
        <Row label="Line height">
          <TextControl element={element} property="line-height" initial={values.lineHeight} />
        </Row>
        <Row label="Letter spacing">
          <TextControl element={element} property="letter-spacing" initial={values.letterSpacing} />
        </Row>
        <Row label="Text align">
          <SelectControl
            element={element}
            property="text-align"
            options={TEXT_ALIGN_OPTIONS}
            current={values.textAlign}
          />
        </Row>
        <Row label="Color">
          <ColorControl element={element} property="color" initial={values.color} />
        </Row>
      </Section>

      <Section title="Appearance">
        <Row label="Background">
          <ColorControl element={element} property="background-color" initial={values.backgroundColor} />
        </Row>
        <Row label="Border width">
          <TextControl element={element} property="border-width" initial={values.borderWidth} />
        </Row>
        <Row label="Border style">
          <SelectControl
            element={element}
            property="border-style"
            options={BORDER_STYLE_OPTIONS}
            current={values.borderStyle}
          />
        </Row>
        <Row label="Border color">
          <ColorControl element={element} property="border-color" initial={values.borderColor} />
        </Row>
        <Row label="Radius">
          <TextControl element={element} property="border-radius" initial={values.borderRadius} />
        </Row>
        <Row label="Opacity">
          <TextControl element={element} property="opacity" initial={values.opacity} />
        </Row>
        <Row label="Shadow">
          <TextControl element={element} property="box-shadow" initial={values.boxShadow} />
        </Row>
      </Section>
    </div>
  )
}
