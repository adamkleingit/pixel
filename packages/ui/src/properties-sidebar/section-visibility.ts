import { categorizeTag, type TagCategory } from './tag-category'

/**
 * Which property sections apply to each kind of element. The sidebar renders
 * only the sections listed here for the currently-selected element.
 *
 *   text / input / action / table  → include Typography
 *   layout / media / other         → skip Typography
 *   media                          → include Source (src / media URL)
 *
 * Keep this dictionary the single source of truth for sidebar visibility.
 */

export type PropertySection =
  | 'position'
  | 'layout'
  | 'appearance'
  | 'typography'
  | 'textColor'
  | 'source'
  | 'input'
  | 'fill'
  | 'stroke'
  | 'effects'

const SECTIONS_BY_CATEGORY: Record<TagCategory, PropertySection[]> = {
  text:   ['position', 'layout', 'appearance', 'typography', 'textColor',                    'fill', 'stroke', 'effects'],
  input:  ['position', 'layout', 'appearance', 'typography', 'textColor',           'input', 'fill', 'stroke', 'effects'],
  action: ['position', 'layout', 'appearance', 'typography', 'textColor',                    'fill', 'stroke', 'effects'],
  table:  ['position', 'layout', 'appearance', 'typography', 'textColor',                    'fill', 'stroke', 'effects'],
  layout: ['position', 'layout', 'appearance', 'typography', 'textColor',                    'fill', 'stroke', 'effects'],
  media:  ['position', 'layout', 'appearance',                            'source',          'fill', 'stroke', 'effects'],
  other:  ['position', 'layout', 'appearance', 'typography', 'textColor',                    'fill', 'stroke', 'effects'],
}

export function sectionsForTag(tagName: string | null | undefined): PropertySection[] {
  if (!tagName) return SECTIONS_BY_CATEGORY.other
  return SECTIONS_BY_CATEGORY[categorizeTag(tagName)]
}
