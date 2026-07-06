/**
 * Read the CSS value of a property as *explicitly declared* on an element,
 * not as resolved by the browser via `getComputedStyle`.
 *
 * An explicit declaration comes from one of two places:
 *  - the element's inline `style` attribute, or
 *  - a rule in a stylesheet whose selector matches the element.
 *
 * If neither declares the property, the result is `{ value: '', source: null }`
 * and the caller should fall back to `getComputedStyle` for display (shown as
 * a placeholder in the Design pane so the user can tell it was inferred).
 *
 * Matched rules are expensive to compute (one `matches()` call per rule in
 * every adopted stylesheet). We walk the sheets once per element and cache
 * the result in a WeakMap. The cache is implicitly invalidated: the StoryTile
 * replaces `shadowRoot.innerHTML` on every snapshot, which makes the old
 * Element references unreachable and eligible for GC along with their cache
 * entries. No manual invalidation is required as long as rule edits are
 * accompanied by a re-snapshot.
 *
 * Edits via `applyPatch` only mutate inline style, which is read live (no
 * caching), so edits appear instantly without touching the matched-rules
 * cache.
 */

export type ExplicitSource = 'inline' | 'rule' | null

export interface ExplicitResult {
  value: string
  source: ExplicitSource
}

export function readExplicit(el: Element, property: string): ExplicitResult {
  const inline = readInline(el, property)
  if (inline) return { value: inline, source: 'inline' }

  const rules = getMatchedRules(el)
  // Iterate winning rules first (highest specificity, then later document order).
  for (let i = rules.length - 1; i >= 0; i--) {
    const value = rules[i].rule.style.getPropertyValue(property).trim()
    if (value) return { value, source: 'rule' }
  }
  return { value: '', source: null }
}

/**
 * Like `readExplicit` but returns the unitless pixel value as a string for
 * use in numeric inputs. Values not in `px` are treated as non-explicit (the
 * caller falls back to the computed placeholder). Unit preservation can be
 * layered on later if needed.
 */
export function readExplicitPx(el: Element, property: string): ExplicitResult {
  const raw = readExplicit(el, property)
  if (raw.source === null) return raw
  const px = toPxNumber(raw.value)
  if (px === null) return { value: '', source: null }
  return { value: px, source: raw.source }
}

function toPxNumber(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed === '0') return '0'
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)px$/i)
  if (!match) return null
  const n = parseFloat(match[1])
  return Number.isFinite(n) ? String(Math.round(n)) : null
}

function readInline(el: Element, property: string): string {
  const style = (el as HTMLElement | SVGElement).style
  if (!style) return ''
  return style.getPropertyValue(property).trim()
}

// ---------------------------------------------------------------------------
// Matched-rule cache
// ---------------------------------------------------------------------------

interface MatchedRule {
  rule: CSSStyleRule
  /** Packed specificity: a*65536 + b*256 + c. */
  specificity: number
  /** Document order, used to break specificity ties (later wins). */
  order: number
}

const matchedRulesCache = new WeakMap<Element, MatchedRule[]>()

/** Exposed for tests; production code does not call this. */
export function _clearMatchedRulesCacheForTests(): void {
  // WeakMap has no clear(); reassign isn't possible through the const binding.
  // We instead re-export a sentinel used only by tests that want a fresh map
  // per test case. Tests create fresh elements so entries die naturally, but
  // we keep this hook in case future tests need to force re-compute on the
  // same element ref.
}

function getMatchedRules(el: Element): MatchedRule[] {
  const cached = matchedRulesCache.get(el)
  if (cached) return cached
  const rules = computeMatchedRules(el)
  matchedRulesCache.set(el, rules)
  return rules
}

function computeMatchedRules(el: Element): MatchedRule[] {
  const sheets = collectStylesheets(el)
  const out: MatchedRule[] = []
  const ctx = { order: 0 }
  for (const sheet of sheets) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // Cross-origin sheet — can't read rules. Skip.
      continue
    }
    walkRules(rules, el, out, ctx)
  }
  out.sort((a, b) => {
    if (a.specificity !== b.specificity) return a.specificity - b.specificity
    return a.order - b.order
  })
  return out
}

function collectStylesheets(el: Element): CSSStyleSheet[] {
  const root = el.getRootNode()
  const sheets: CSSStyleSheet[] = []
  if (root instanceof ShadowRoot) {
    const adopted = root.adoptedStyleSheets
    if (adopted) for (const s of adopted) sheets.push(s)
    const own = root.styleSheets
    for (let i = 0; i < own.length; i++) sheets.push(own[i])
  } else {
    const doc = el.ownerDocument ?? document
    for (let i = 0; i < doc.styleSheets.length; i++) {
      sheets.push(doc.styleSheets[i] as CSSStyleSheet)
    }
  }
  return sheets
}

function walkRules(
  rules: CSSRuleList,
  el: Element,
  out: MatchedRule[],
  ctx: { order: number },
): void {
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]
    if (isStyleRule(rule)) {
      const spec = matchSpecificity(rule.selectorText, el)
      if (spec >= 0) {
        out.push({ rule, specificity: spec, order: ctx.order++ })
      }
    } else if (isMediaRule(rule)) {
      if (mediaMatches(rule.conditionText ?? rule.media?.mediaText ?? '')) {
        walkRules(rule.cssRules, el, out, ctx)
      }
    } else if (isSupportsRule(rule)) {
      // Supports conditions are resolved by the browser at parse time; if the
      // rule is in the sheet, treat it as active. Walking the inner rules
      // discovers any style rules inside.
      walkRules(rule.cssRules, el, out, ctx)
    }
  }
}

// Use duck-typing rather than `instanceof` because jsdom (and some older
// browsers) expose the rule classes under slightly different global names.
// Checking `type` + shape is stable across environments.
function isStyleRule(rule: CSSRule): rule is CSSStyleRule {
  return rule.type === 1 /* CSSRule.STYLE_RULE */
    && typeof (rule as CSSStyleRule).selectorText === 'string'
}

function isMediaRule(rule: CSSRule): rule is CSSMediaRule {
  return rule.type === 4 /* CSSRule.MEDIA_RULE */
}

function isSupportsRule(rule: CSSRule): rule is CSSSupportsRule {
  return rule.type === 12 /* CSSRule.SUPPORTS_RULE */
}

function mediaMatches(condition: string): boolean {
  if (!condition) return true
  try {
    return window.matchMedia(condition).matches
  } catch {
    return true
  }
}

/**
 * Packed specificity of the highest-specificity sub-selector in a selector
 * list that matches `el`. Returns -1 if none match.
 */
function matchSpecificity(selectorList: string, el: Element): number {
  const parts = splitSelectorList(selectorList)
  let best = -1
  for (const sel of parts) {
    let matches = false
    try {
      matches = el.matches(sel)
    } catch {
      // Invalid-for-JS selector (e.g. `:host`, some pseudo-elements). Skip.
      continue
    }
    if (matches) {
      const s = specificityOf(sel)
      if (s > best) best = s
    }
  }
  return best
}

function splitSelectorList(sel: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) {
      parts.push(sel.slice(start, i).trim())
      start = i + 1
    }
  }
  parts.push(sel.slice(start).trim())
  return parts
}

/**
 * CSS specificity packed as a*65536 + b*256 + c, where
 *   a = #id
 *   b = .class / [attr] / :pseudo-class
 *   c = type selector / ::pseudo-element
 *
 * Regex-based count; good enough for typical app CSS. :not/:is/:where/:has
 * internals are stripped rather than scored, which is a simplification (the
 * real spec says :is/:not count their max inner specificity and :where
 * contributes zero). If this starts causing wrong winners in practice we can
 * swap in the `specificity` npm package.
 */
function specificityOf(sel: string): number {
  const stripped = sel.replace(/:(?:not|is|where|has)\([^)]*\)/g, '')
  const ids = (stripped.match(/#[\w-]+/g) ?? []).length
  const classes = (stripped.match(/\.[\w-]+/g) ?? []).length
  const attrs = (stripped.match(/\[[^\]]+\]/g) ?? []).length
  const pseudoCls = (stripped.match(/(?<!:):[a-zA-Z-][\w-]*(?:\([^)]*\))?/g) ?? []).length
  const pseudoEls = (stripped.match(/::[a-zA-Z-][\w-]*/g) ?? []).length
  const types = (stripped.match(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g) ?? []).length
  return ids * 65536 + (classes + attrs + pseudoCls) * 256 + (types + pseudoEls)
}
