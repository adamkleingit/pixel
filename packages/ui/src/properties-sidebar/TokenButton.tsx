/**
 * TokenButton — the small "Use token" trigger next to a property input.
 * Manages its own popover open/close + anchor ref. Hidden when no tokens of
 * the relevant kind exist (zero-tokens → don't add UI noise).
 */
import { useRef, useState } from 'react'
import type { Token } from '../pixel-common'
import { useTokensOf } from '../tokens-context'
import { IconButton } from '../design-system'
import { TokenPickerPopover } from './TokenPickerPopover'
import { tokenKindForProperty } from './token-mapping'

export interface TokenButtonProps {
  /** CSS property the picker is editing — drives kind filter + verb. */
  property: string
  /** Currently-bound token id, if any (highlights row + reveals Clear). */
  selectedTokenId?: string | null
  onSelect: (token: Token) => void
  onClear?: () => void
  /** Hide entirely when no tokens of the right kind exist. Defaults true. */
  hideWhenEmpty?: boolean
  title?: string
  disabled?: boolean
}

export function TokenButton({
  property,
  selectedTokenId = null,
  onSelect,
  onClear,
  hideWhenEmpty = true,
  title,
  disabled = false,
}: TokenButtonProps) {
  const kind = tokenKindForProperty(property)
  const tokens = useTokensOf(kind)
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement | null>(null)

  if (hideWhenEmpty && tokens.length === 0) return null

  return (
    <>
      <span ref={anchorRef as unknown as React.RefObject<HTMLSpanElement>}>
        <IconButton
          title={title ?? (selectedTokenId ? 'Change token' : 'Use a token')}
          active={!!selectedTokenId}
          disabled={disabled}
          onClick={() => setOpen(o => !o)}
          size="small"
        >
          <TokenGlyph active={!!selectedTokenId} />
        </IconButton>
      </span>
      <TokenPickerPopover
        isOpen={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef as unknown as React.RefObject<HTMLElement | null>}
        property={property}
        selectedTokenId={selectedTokenId}
        onSelect={onSelect}
        onClear={onClear}
      />
    </>
  )
}

/** Small dot-grid glyph that reads as "token list". Inlined so we don't have
 *  to add another icon to the design-system catalog for a single use site. */
function TokenGlyph({ active }: { active: boolean }) {
  const fill = 'currentColor'
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      aria-hidden
      style={{ opacity: active ? 1 : 0.85 }}
    >
      <circle cx={7} cy={7} r={2.4} fill={fill} />
      <circle cx={17} cy={7} r={2.4} fill={fill} />
      <circle cx={7} cy={17} r={2.4} fill={fill} />
      <circle cx={17} cy={17} r={2.4} fill={fill} />
    </svg>
  )
}
