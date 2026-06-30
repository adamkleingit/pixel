/**
 * TokenPickerPopover — popover that shows tokens of a given kind for the
 * property being edited. Used by every section's "Use token" button.
 *
 * Layout:
 *   - search input at top (filters by name + value substring)
 *   - "Clear" row when a token is currently bound (clicking sends a no-source
 *     patch that reverts to the underlying value)
 *   - one row per matching token: preview + name + value + write-spelling chip
 *
 * The chip shows the *property-aware* spelling (`bg-primary` in a bg context,
 * `border-primary` in a border-color context). That's the literal string the
 * agent will write at the use site (see token-mapping.ts).
 */
import { useMemo, useState, type RefObject } from 'react'
import type { Token } from '../pixel-common'
import { useTokensOf } from '../tokens-context'
import { Popover } from './Popover'
import { renderTokenPreview } from './token-preview'
import {
  bareDisplayName,
  spellingForProperty,
  tokenKindForProperty,
} from './token-mapping'
import { COLORS, FONTS, FONT_SIZE, RADIUS } from '../design-system'

export interface TokenPickerPopoverProps {
  isOpen: boolean
  onClose: () => void
  anchorRef: RefObject<HTMLElement | null>
  /** CSS property the picker is editing — drives kind filter + verb. */
  property: string
  /** Id of the currently-bound token, if any. Highlights its row + reveals
   *  the "Clear" action. */
  selectedTokenId?: string | null
  onSelect: (token: Token) => void
  onClear?: () => void
}

export function TokenPickerPopover({
  isOpen,
  onClose,
  anchorRef,
  property,
  selectedTokenId,
  onSelect,
  onClear,
}: TokenPickerPopoverProps) {
  const kind = tokenKindForProperty(property)
  const tokens = useTokensOf(kind)
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return tokens
    return tokens.filter(
      t =>
        t.name.toLowerCase().includes(q) ||
        t.value.toLowerCase().includes(q),
    )
  }, [tokens, filter])

  return (
    <Popover
      isOpen={isOpen}
      onClose={onClose}
      anchorRef={anchorRef}
      title={`${kindLabel(kind)} tokens`}
      width={280}
      placement="left"
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '8px 8px 4px' }}>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search tokens"
            autoFocus
            style={{
              width: '100%',
              padding: '6px 8px',
              background: COLORS.bgElevated,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              fontFamily: FONTS.ui,
              fontSize: FONT_SIZE.base,
              color: COLORS.textPrimary,
              outline: 'none',
            }}
          />
        </div>

        {onClear && selectedTokenId && (
          <button
            type="button"
            onClick={() => {
              onClear()
              onClose()
            }}
            style={{
              ...rowBaseStyle,
              color: COLORS.textSecondary,
              fontStyle: 'italic',
            }}
          >
            <div style={previewSlotStyle} />
            <span>Clear binding (keep current value)</span>
          </button>
        )}

        <div
          style={{
            maxHeight: 360,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {filtered.length === 0 ? (
            <EmptyState hasTokens={tokens.length > 0} kind={kind} />
          ) : (
            filtered.map(t => (
              <TokenRow
                key={t.id}
                token={t}
                property={property}
                selected={t.id === selectedTokenId}
                onClick={() => {
                  onSelect(t)
                  onClose()
                }}
              />
            ))
          )}
        </div>
      </div>
    </Popover>
  )
}

function TokenRow({
  token,
  property,
  selected,
  onClick,
}: {
  token: Token
  property: string
  selected: boolean
  onClick: () => void
}) {
  const usage = spellingForProperty(token, property)
  const chipText =
    usage.kind === 'utility'
      ? usage.className
      : usage.kind === 'css-var'
        ? usage.expr
        : usage.path
  return (
    <button
      type="button"
      onClick={onClick}
      title={`${token.name} — ${token.value}`}
      style={{
        ...rowBaseStyle,
        background: selected ? COLORS.bgActive : 'transparent',
      }}
      onMouseEnter={e => {
        if (!selected) e.currentTarget.style.background = COLORS.bgHover
      }}
      onMouseLeave={e => {
        if (!selected) e.currentTarget.style.background = 'transparent'
      }}
    >
      <div style={previewSlotStyle}>{renderTokenPreview(token)}</div>
      <div style={{ flex: '1 1 0', minWidth: 0, textAlign: 'left' }}>
        <div
          style={{
            fontFamily: FONTS.ui,
            fontSize: FONT_SIZE.base,
            color: COLORS.textPrimary,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {bareDisplayName(token)}
        </div>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZE.xs,
            color: COLORS.textMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {token.value}
        </div>
      </div>
      <span
        style={{
          flexShrink: 0,
          padding: '2px 6px',
          background: COLORS.bgElevated,
          border: `1px solid ${COLORS.borderSubtle}`,
          borderRadius: RADIUS.sm,
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.xs,
          color: COLORS.textSecondary,
          maxWidth: 100,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {chipText}
      </span>
    </button>
  )
}

function EmptyState({
  hasTokens,
  kind,
}: {
  hasTokens: boolean
  kind: ReturnType<typeof tokenKindForProperty>
}) {
  return (
    <div
      style={{
        padding: '20px 12px',
        fontFamily: FONTS.ui,
        fontSize: FONT_SIZE.sm,
        color: COLORS.textMuted,
        textAlign: 'center',
      }}
    >
      {hasTokens
        ? 'No tokens match your search.'
        : `No ${kindLabel(kind).toLowerCase()} tokens in this project.`}
    </div>
  )
}

const rowBaseStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  transition: 'background 0.1s',
  textAlign: 'left' as const,
}

const previewSlotStyle = {
  width: 36,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
}

function kindLabel(kind: ReturnType<typeof tokenKindForProperty>): string {
  switch (kind) {
    case 'color': return 'Color'
    case 'radius': return 'Radius'
    case 'shadow': return 'Shadow'
    case 'font-size': return 'Font size'
    case 'font-family': return 'Font family'
    case 'font-weight': return 'Font weight'
    case 'line-height': return 'Line height'
    case 'letter-spacing': return 'Letter spacing'
    case 'spacing': return 'Spacing'
    case 'border-width': return 'Border width'
    case 'opacity': return 'Opacity'
    default: return 'Token'
  }
}
