import type { HTMLAttributes, ReactNode } from 'react'
import { COLORS, SIZES } from './tokens'

export interface NumericInputProps {
  value?: string
  onChange?: ((value: string) => void) | null
  prefix?: ReactNode
  suffix?: string
  placeholder?: string
  ariaLabel?: string
  /** When true, the input is fully inert (read-only, dimmed, not-allowed
   *  cursor, scrubber prefix disabled). Used for the multi-edit "Multiple"
   *  state until designers explicitly type a new value. */
  disabled?: boolean
  prefixProps?: HTMLAttributes<HTMLSpanElement>
  /** Name of the design token the current value coincides with — replaces the
   *  unit suffix and tints the input to signal a live token binding. */
  tokenLabel?: string | null
}

export function NumericInput({
  value = '',
  onChange = null,
  prefix = null,
  suffix = '',
  placeholder = '',
  ariaLabel = '',
  disabled = false,
  prefixProps = {},
  tokenLabel = null,
}: NumericInputProps = {}) {
  return (
    <label
      title={tokenLabel ? `Bound to token: ${tokenLabel}` : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        // space-between pushes the value group (prefix + numeric input) to the
        // left and the token label / suffix to the right, so the token name
        // anchors to the right edge of the input and grows responsively as the
        // sidebar widens — instead of getting clipped at a fixed cap.
        justifyContent: 'space-between',
        gap: 6,
        height: SIZES.rowHeight,
        padding: '0 8px',
        background: COLORS.input,
        borderRadius: 4,
        overflow: 'hidden',
        color: COLORS.text,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.5 : 1,
        // Subtle highlight when the value coincides with a token. Uses border
        // rather than background to keep the input visually identical when
        // empty / focused.
        boxShadow: tokenLabel ? `inset 0 0 0 1px ${COLORS.accent}` : undefined,
      }}
    >
      {/* Value group — prefix (unit icon / scrubber handle) + the numeric input.
          Pinned to the left edge at its natural width so the token label can
          claim the remaining space; the input itself is sized to fit a few
          digits, which is all this control ever shows. */}
      <span
        style={{
          flex: '0 0 auto',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          minWidth: 0,
        }}
      >
        {prefix && (
          <span
            {...prefixProps}
            style={{
              color: COLORS.muted,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 12,
              fontSize: 11,
              flexShrink: 0,
              // Disable scrubbing on the prefix when the input is inert; the
              // useScrubbable hook installs its handlers via prefixProps so
              // we can't strip them, but pointer-events: none on the parent
              // makes the prefix unclickable.
              ...(disabled ? { pointerEvents: 'none' as const, cursor: 'not-allowed' as const } : null),
              ...(prefixProps.style ?? {}),
            }}
          >
            {prefix}
          </span>
        )}
        <input
          type="text"
          value={value}
          onChange={e => onChange?.(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          disabled={disabled}
          style={{
            // Fixed width sized for the typical 1–4 digit values this control
            // shows (opacity, radius, font size, gap, etc.). Token labels sit
            // in the responsive slot to the right — see the outer label's
            // space-between layout.
            width: 44,
            flex: '0 0 auto',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: COLORS.text,
            fontSize: 12,
            padding: 0,
            fontFamily: 'inherit',
            cursor: disabled ? 'not-allowed' : 'text',
          }}
        />
      </span>
      {tokenLabel ? (
        <span
          style={{
            // Take the rest of the row and right-align so the token name
            // anchors to the input's right edge — wide pane = more room for
            // long names, narrow pane = ellipsis instead of a hard cap.
            flex: 1,
            minWidth: 0,
            color: COLORS.accent,
            fontSize: 11,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {tokenLabel}
        </span>
      ) : (
        suffix && (
          <span style={{ color: COLORS.muted, fontSize: 11, flexShrink: 0 }}>
            {suffix}
          </span>
        )
      )}
    </label>
  )
}
