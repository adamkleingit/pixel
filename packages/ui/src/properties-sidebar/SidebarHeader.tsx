import { COLORS, FONT_SIZE, FONTS } from '../design-system'
import { categorizeTag, categoryColor, categoryLabel } from './tag-category'

/** Sentinel tag for a multi-selection whose elements don't all share a tag —
 *  the header shows "Multiple" for both the type and the category. */
export const MIXED_TAG = '\0multiple'

export interface SidebarHeaderProps {
  tagName?: string | null
}

export function SidebarHeader({ tagName = null }: SidebarHeaderProps = {}) {
  const hasSelection = !!tagName
  const mixed = tagName === MIXED_TAG
  const category = hasSelection && !mixed ? categorizeTag(tagName!) : 'other'
  const color = categoryColor(category)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '10px 12px',
        borderBottom: `1px solid ${COLORS.border}`,
        minHeight: 40,
      }}
    >
      {hasSelection ? (
        <>
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.base,
              fontWeight: 600,
              color: COLORS.textPrimary,
              letterSpacing: '-0.01em',
              textTransform: 'lowercase',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {mixed ? 'Multiple' : `<${tagName!.toLowerCase()}>`}
          </span>
          <span
            style={{
              fontSize: FONT_SIZE.xs,
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '2px 6px',
              borderRadius: 3,
              background: `${color}22`,
              color,
              flexShrink: 0,
            }}
          >
            {mixed ? 'Multiple' : categoryLabel(category)}
          </span>
        </>
      ) : (
        <span style={{ fontSize: FONT_SIZE.base, color: COLORS.textMuted }}>No selection</span>
      )}
    </div>
  )
}
