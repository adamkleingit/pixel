import type { ReactNode } from 'react'
import { Dropdown } from './Dropdown'
import { NumericInput } from './NumericInput'
import { useScrubbable, type ScrubExtras, type ScrubModifiers, type SnapTarget } from './useScrubbable'
import {
  composeDimension,
  isLengthUnit,
  parseDimension,
  type UnitOption,
} from '../edit/dimension'

export interface DimensionInputProps {
  /** Raw CSS value (with unit), e.g. `12px`, `1.5`, `50%`, `auto`. */
  value?: string
  /** Computed fallback shown (dimmed) when `value` has no explicit number. */
  placeholder?: string
  /** Emits the recomposed raw CSS value. Scrub passes modifier + snap extras. */
  onChange?: ((value: string, mods?: ScrubModifiers, extras?: ScrubExtras) => void) | null
  /** Unit choices for the picker (see edit/dimension option sets). */
  options: UnitOption[]
  ariaLabel?: string
  prefix?: ReactNode
  disabled?: boolean
  min?: number | null
  max?: number | null
  step?: number
  /** Token snap targets — only applied while the unit is `px`. */
  snap?: { targets: SnapTarget[]; threshold: number }
  /** Token name the current value coincides with (tints the field). */
  tokenLabel?: string | null
}

/**
 * A numeric input with a selectable unit (px / % / em / rem / … / keywords).
 * Parses `value` into a number + unit, scrubs the number, and recomposes on
 * every edit. The number input hugs the value; the unit picker sits beside it.
 */
export function DimensionInput({
  value = '',
  placeholder = '',
  onChange = null,
  options,
  ariaLabel = '',
  prefix = null,
  disabled = false,
  min = null,
  max = null,
  step = 1,
  snap,
  tokenLabel = null,
}: DimensionInputProps) {
  const { num, unit } = parseDimension(value)
  const isKeyword = unit !== '' && !isLengthUnit(unit)
  const defaultUnit = options.find(o => isLengthUnit(o.value))?.value ?? 'px'
  // The unit an edited number carries. When there's a numeric value, keep its
  // unit (a length like `px`, or unitless for line-height `1.5`). When there
  // ISN'T — a keyword like `normal`, or an empty value — default to px so typing
  // a number yields e.g. `3px` instead of being uneditable / unitless.
  const numUnit = num !== '' ? unit : defaultUnit
  // What the unit picker shows: the keyword when one is set (honest — the value
  // IS `normal`), else the px default surfaces for the empty case.
  const displayUnit = isKeyword ? unit : num !== '' ? unit : defaultUnit
  const placeholderNum = parseDimension(placeholder).num

  const emitNumber = (v: string, mods?: ScrubModifiers, extras?: ScrubExtras) =>
    onChange?.(composeDimension(v, numUnit), mods, extras)

  const emitUnit = (u: string) => {
    if (isLengthUnit(u)) onChange?.(composeDimension(num || placeholderNum || '0', u))
    else onChange?.(u) // keyword stands alone
  }

  const scrub = useScrubbable({
    value: num || placeholderNum,
    onChange: emitNumber,
    min,
    max,
    step,
    snap: numUnit === 'px' ? snap : undefined,
  })

  return (
    <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0, alignItems: 'center' }}>
      <NumericInput
        value={isKeyword ? '' : num}
        placeholder={isKeyword ? unit : placeholderNum || placeholder}
        onChange={v => emitNumber(v)}
        prefix={prefix}
        ariaLabel={ariaLabel}
        disabled={disabled}
        prefixProps={scrub.prefixProps}
        tokenLabel={tokenLabel}
      />
      <div style={{ width: 52, flexShrink: 0 }}>
        <Dropdown
          value={displayUnit}
          onChange={emitUnit}
          options={options}
          disabled={disabled}
          renderTrigger={cur => (
            <span style={{ fontSize: 11 }}>{cur ? cur.label : '—'}</span>
          )}
        />
      </div>
    </div>
  )
}
