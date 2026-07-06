import type { ReactNode } from 'react'
import { IconButton } from './IconButton'

export interface SegmentedButtonOption {
  value: string
  icon: ReactNode
  title?: string
}

export interface SegmentedButtonGroupProps {
  options?: SegmentedButtonOption[]
  value?: string | null
  onChange?: ((value: string) => void) | null
}

export function SegmentedButtonGroup({
  options = [],
  value = null,
  onChange = null,
}: SegmentedButtonGroupProps = {}) {
  return (
    <div style={{ display: 'inline-flex', gap: 0 }}>
      {options.map(opt => (
        <IconButton
          key={opt.value}
          title={opt.title ?? ''}
          isActive={opt.value === value}
          onClick={() => onChange?.(opt.value)}
        >
          {opt.icon}
        </IconButton>
      ))}
    </div>
  )
}
