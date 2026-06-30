import { useState } from 'react'
import type React from 'react'
import { Dropdown } from './Dropdown'
import { NumericInput } from './NumericInput'
import { Popover } from './Popover'
import { Row } from './Row'
import { SegmentedButtonGroup } from './SegmentedButtonGroup'
import { COLORS } from './tokens'
import { useScrubbable } from './useScrubbable'

export interface StrokeSettingsPopoverProps {
  isOpen?: boolean
  onClose?: (() => void) | null
  anchorRef?: React.RefObject<HTMLElement | null> | null
}

type Tab = 'basic' | 'dynamic' | 'brush'

export function StrokeSettingsPopover({
  isOpen = false,
  onClose = null,
  anchorRef = null,
}: StrokeSettingsPopoverProps = {}) {
  const [tab, setTab] = useState<Tab>('basic')
  const [style, setStyle] = useState('Solid')
  const [miter, setMiter] = useState('28.96')
  const [join, setJoin] = useState<'miter' | 'round' | 'bevel'>('miter')

  const scrubMiter = useScrubbable({
    value: miter,
    onChange: setMiter,
    min: 0,
    max: 180,
    precision: 2,
  })

  return (
    <Popover isOpen={isOpen} onClose={onClose} anchorRef={anchorRef} width={260} title="Stroke settings">
      <div style={{ padding: 10 }}>
        <div
          style={{
            display: 'flex',
            gap: 2,
            marginBottom: 12,
            background: COLORS.input,
            borderRadius: 4,
            padding: 2,
          }}
        >
          {(['basic', 'dynamic', 'brush'] as Tab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                height: 24,
                background: tab === t ? COLORS.inputActive : 'transparent',
                color: tab === t ? COLORS.text : COLORS.muted,
                border: 'none',
                borderRadius: 3,
                fontSize: 12,
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontFamily: 'inherit',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === 'basic' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1fr',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 11, color: COLORS.label }}>Style</div>
              <Dropdown
                value={style}
                onChange={setStyle}
                options={['Solid', 'Dashed', 'Dotted', 'Custom'].map(v => ({
                  value: v,
                }))}
              />

              <div style={{ fontSize: 11, color: COLORS.label }}>Width profile</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <Dropdown
                    value="uniform"
                    onChange={() => {}}
                    options={[
                      { value: 'uniform', label: '', icon: uniformProfile },
                      { value: 'tapered', label: 'Tapered' },
                      { value: 'pointed', label: 'Pointed' },
                    ]}
                    renderTrigger={() => uniformProfile}
                  />
                </div>
                <button
                  type="button"
                  title="Reverse profile"
                  style={{
                    width: 24,
                    height: 24,
                    background: 'transparent',
                    border: 'none',
                    color: COLORS.muted,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
                    <path d="M 3 4 H 11 M 9 2 L 11 4 L 9 6" />
                    <path d="M 11 10 H 3 M 5 8 L 3 10 L 5 12" />
                  </svg>
                </button>
              </div>

              <div style={{ fontSize: 11, color: COLORS.label }}>Join</div>
              <SegmentedButtonGroup
                value={join}
                onChange={v => setJoin(v as typeof join)}
                options={[
                  { value: 'miter', icon: miterIcon, title: 'Miter' },
                  { value: 'round', icon: roundIcon, title: 'Round' },
                  { value: 'bevel', icon: bevelIcon, title: 'Bevel' },
                ]}
              />

              <div style={{ fontSize: 11, color: COLORS.label }}>Miter angle</div>
              <Row>
                <NumericInput
                  value={miter}
                  onChange={setMiter}
                  suffix="°"
                  prefix={miterPrefix}
                  prefixProps={scrubMiter.prefixProps}
                />
              </Row>
            </div>
          </div>
        ) : (
          <div
            style={{
              padding: 24,
              fontSize: 12,
              color: COLORS.muted,
              textAlign: 'center',
              textTransform: 'capitalize',
            }}
          >
            {tab} stroke — coming soon
          </div>
        )}
      </div>
    </Popover>
  )
}

const uniformProfile = (
  <svg viewBox="0 0 80 14" width="80" height="14" fill="currentColor">
    <rect x="2" y="6" width="76" height="2" rx="1" />
  </svg>
)

const miterIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="miter">
    <path d="M 3 4 L 3 12 L 12 12" />
  </svg>
)
const roundIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M 3 4 L 3 12 L 12 12" />
  </svg>
)
const bevelIcon = (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="bevel">
    <path d="M 3 4 L 3 12 L 12 12" />
  </svg>
)

const miterPrefix = (
  <svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
    <path d="M 2 10 L 2 2 M 2 10 L 10 10" />
    <path d="M 4 6 A 2 2 0 0 1 6 8" />
  </svg>
)
