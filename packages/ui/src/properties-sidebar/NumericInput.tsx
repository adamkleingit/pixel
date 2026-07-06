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
  // Size the input to the digits it actually holds (capped) so the unit suffix
  // sits right after the number instead of across a fixed-width gap. `ch` ≈ one
  // digit in the inherited font; +2px keeps the caret from touching the suffix.
  const contentChars = Math.max((value ?? '').length, (placeholder ?? '').length, 1)

  return (
    <label
      title={tokenLabel ? `Bound to token: ${tokenLabel}` : undefined}
      style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        // With a token label present, space-between anchors the token name to
        // the right edge (grows with the sidebar). For a plain unit suffix we
        // pack left instead, so it reads "100%" tight to the value rather than
        // floating at the far edge with dead space in between.
        justifyContent: tokenLabel ? 'space-between' : 'flex-start',
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
          // Shrinkable (0 1 auto) so in tight cells the value group gives up
          // width before the suffix / token label is clipped.
          flex: '0 1 auto',
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
            // Hug the current value (see contentChars) so the suffix sits
            // right after the number, capped at 44px — the old fixed width —
            // so long values (e.g. "140.6") never blow past their cell. Shrinks
            // below content in very tight cells (minWidth: 0) so the suffix is
            // never clipped.
            width: `calc(${contentChars}ch + 2px)`,
            maxWidth: 44,
            flex: '0 1 auto',
            minWidth: 0,
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
