/**
 * Map an HTML tag name to a coarse semantic category used by the sidebar
 * header. The categories line up with the kinds of edits a designer typically
 * wants to reach for: text formatting, form inputs, layout/spacing, actions,
 * media.
 */

export type TagCategory =
  | 'text'
  | 'input'
  | 'layout'
  | 'action'
  | 'media'
  | 'table'
  | 'other'

const TAG_TO_CATEGORY: Record<string, TagCategory> = {
  // Text
  h1: 'text', h2: 'text', h3: 'text', h4: 'text', h5: 'text', h6: 'text',
  p: 'text', span: 'text', strong: 'text', em: 'text', b: 'text', i: 'text',
  small: 'text', mark: 'text', del: 'text', ins: 'text', sub: 'text', sup: 'text',
  blockquote: 'text', pre: 'text', code: 'text', kbd: 'text', samp: 'text',
  label: 'text', abbr: 'text', cite: 'text', q: 'text', time: 'text',

  // Input
  input: 'input', textarea: 'input', select: 'input', option: 'input',
  optgroup: 'input', form: 'input', fieldset: 'input', legend: 'input',
  datalist: 'input', output: 'input', progress: 'input', meter: 'input',

  // Layout
  div: 'layout', section: 'layout', article: 'layout', header: 'layout',
  footer: 'layout', nav: 'layout', aside: 'layout', main: 'layout',
  ul: 'layout', ol: 'layout', li: 'layout', dl: 'layout', dt: 'layout',
  dd: 'layout', figure: 'layout', figcaption: 'layout', hr: 'layout',
  br: 'layout', details: 'layout', summary: 'layout',

  // Action
  button: 'action', a: 'action',

  // Media
  img: 'media', video: 'media', audio: 'media', canvas: 'media',
  svg: 'media', picture: 'media', source: 'media', track: 'media',
  iframe: 'media', embed: 'media', object: 'media',

  // Table
  table: 'table', thead: 'table', tbody: 'table', tfoot: 'table',
  tr: 'table', td: 'table', th: 'table', caption: 'table', colgroup: 'table', col: 'table',
}

export function categorizeTag(tagName: string): TagCategory {
  return TAG_TO_CATEGORY[tagName.toLowerCase()] ?? 'other'
}

const CATEGORY_LABEL: Record<TagCategory, string> = {
  text: 'Text',
  input: 'Input',
  layout: 'Layout',
  action: 'Action',
  media: 'Media',
  table: 'Table',
  other: 'Other',
}

const CATEGORY_COLOR: Record<TagCategory, string> = {
  text:   '#8b92ff',
  input:  '#4fd1c5',
  layout: '#a0aec0',
  action: '#f6ad55',
  media:  '#ed64a6',
  table:  '#b794f4',
  other:  '#6b7280',
}

export function categoryLabel(category: TagCategory): string {
  return CATEGORY_LABEL[category]
}

export function categoryColor(category: TagCategory): string {
  return CATEGORY_COLOR[category]
}
