/**
 * TextInput — single-line text field with the chrome look.
 *
 * Light variant only (matches the redesigned Pixel chrome). For a multiline
 * composer, use a plain <textarea> styled with the same tokens — see
 * AgentPanel composer for the canonical example.
 */

import { useState, type CSSProperties, type InputHTMLAttributes } from 'react'
import { COLORS, FONT_SIZE, RADIUS } from '../theme'

export interface TextInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'style'> {
  style?: CSSProperties
}

export function TextInput({ style, ...rest }: TextInputProps) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type="text"
      onFocus={(e) => { setFocused(true);  rest.onFocus?.(e) }}
      onBlur ={(e) => { setFocused(false); rest.onBlur ?.(e) }}
      {...rest}
      style={{
        background: COLORS.bgSurface,
        color: COLORS.textPrimary,
        border: `1px solid ${focused ? COLORS.accent : COLORS.border}`,
        borderRadius: RADIUS.md,
        padding: '6px 10px',
        fontSize: FONT_SIZE.base,
        fontFamily: 'inherit',
        outline: 'none',
        transition: 'border-color 0.1s, box-shadow 0.1s',
        boxShadow: focused ? `0 0 0 3px ${COLORS.accentDim}` : 'none',
        ...style,
      }}
    />
  )
}
