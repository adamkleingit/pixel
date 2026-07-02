/**
 * CSS property ↔ TokenKind + utility-class verb mapping. The picker uses this
 * to:
 *   1. filter the token list to the kind that property accepts
 *   2. rewrite a token's stored utility class (canonically `bg-*` for colors)
 *      to the right verb at the use site (`text-primary` in a `color` editor,
 *      `border-primary` in a `border-color` editor, etc.).
 *
 * The token spec (pixel/docs/design-tokens.md §3.2) calls out that adapters
 * emit a canonical write spelling and the sidebar swaps the verb per property
 * — this module is that swap.
 */
import type { Token, TokenKind, TokenSource, TokenUsage } from '../pixel-common'

/** Which kind of token the user can pick for this CSS property. */
export function tokenKindForProperty(property: string): TokenKind | null {
  const p = property.toLowerCase()
  if (p === 'background-color' || p === 'background') return 'color'
  if (p === 'color') return 'color'
  if (p === 'border-color' || /^border-(top|right|bottom|left)-color$/.test(p)) return 'color'
  if (p === 'outline-color') return 'color'
  if (p === 'fill' || p === 'stroke') return 'color'

  if (p === 'border-radius' || /^border-.*-radius$/.test(p)) return 'radius'

  if (p === 'box-shadow' || p === 'text-shadow' || p === 'filter') return 'shadow'

  if (p === 'font-family') return 'font-family'
  if (p === 'font-size') return 'font-size'
  if (p === 'font-weight') return 'font-weight'
  if (p === 'line-height') return 'line-height'
  if (p === 'letter-spacing') return 'letter-spacing'

  if (
    p === 'padding' ||
    /^padding-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)$/.test(p) ||
    p === 'margin' ||
    /^margin-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end)$/.test(p) ||
    p === 'gap' || p === 'row-gap' || p === 'column-gap' ||
    p === 'width' || p === 'height' ||
    p === 'min-width' || p === 'min-height' ||
    p === 'max-width' || p === 'max-height' ||
    p === 'top' || p === 'right' || p === 'bottom' || p === 'left' ||
    p === 'inset'
  ) return 'spacing'

  if (p === 'border-width' || /^border-(top|right|bottom|left)-width$/.test(p)) return 'border-width'

  if (p === 'opacity') return 'opacity'

  if (p === 'z-index') return 'z-index'

  return null
}

/** Tailwind verb that should prefix a color/spacing token class for this
 *  property. Returns null when the property uses a non-prefixed form (radius,
 *  shadow) or when no rewrite is needed. */
function verbForProperty(property: string): string | null {
  const p = property.toLowerCase()
  if (p === 'background-color' || p === 'background') return 'bg-'
  if (p === 'color') return 'text-'
  if (p === 'border-color') return 'border-'
  if (p === 'border-top-color') return 'border-t-'
  if (p === 'border-right-color') return 'border-r-'
  if (p === 'border-bottom-color') return 'border-b-'
  if (p === 'border-left-color') return 'border-l-'
  if (p === 'outline-color') return 'outline-'
  if (p === 'fill') return 'fill-'
  if (p === 'stroke') return 'stroke-'

  if (p === 'padding') return 'p-'
  if (p === 'padding-top') return 'pt-'
  if (p === 'padding-right') return 'pr-'
  if (p === 'padding-bottom') return 'pb-'
  if (p === 'padding-left') return 'pl-'
  if (p === 'padding-inline') return 'px-'
  if (p === 'padding-block') return 'py-'
  if (p === 'margin') return 'm-'
  if (p === 'margin-top') return 'mt-'
  if (p === 'margin-right') return 'mr-'
  if (p === 'margin-bottom') return 'mb-'
  if (p === 'margin-left') return 'ml-'
  if (p === 'margin-inline') return 'mx-'
  if (p === 'margin-block') return 'my-'
  if (p === 'gap') return 'gap-'
  if (p === 'row-gap') return 'gap-y-'
  if (p === 'column-gap') return 'gap-x-'
  if (p === 'width') return 'w-'
  if (p === 'height') return 'h-'
  if (p === 'min-width') return 'min-w-'
  if (p === 'min-height') return 'min-h-'
  if (p === 'max-width') return 'max-w-'
  if (p === 'max-height') return 'max-h-'

  if (p === 'border-top-left-radius') return 'rounded-tl-'
  if (p === 'border-top-right-radius') return 'rounded-tr-'
  if (p === 'border-bottom-right-radius') return 'rounded-br-'
  if (p === 'border-bottom-left-radius') return 'rounded-bl-'

  if (p === 'opacity') return 'opacity-'

  if (p === 'z-index') return 'z-'

  if (p === 'border-width') return 'border-'
  if (p === 'border-top-width') return 'border-t-'
  if (p === 'border-right-width') return 'border-r-'
  if (p === 'border-bottom-width') return 'border-b-'
  if (p === 'border-left-width') return 'border-l-'

  return null
}

/**
 * Strip a Tailwind verb (`bg-`, `text-`, `rounded-`, …) from the start of a
 * class so the picker can re-verb it for the current property. Conservative:
 * only strips known prefixes; otherwise returns the class as-is.
 */
function stripVerb(className: string): string {
  return className
    .replace(
      /^(bg|text|border(-[trbl])?|outline|fill|stroke|p[trblxy]?|m[trblxy]?|gap(-[xy])?|w|h|min-w|min-h|max-w|max-h|rounded(-[tb][lr])?|shadow|font|leading|tracking|opacity|z)-/,
      '',
    )
}

/**
 * For a token + the property being written, return the spelling the agent
 * should put in source. For utility tokens, we re-verb (`bg-primary` →
 * `text-primary` in a color editor). For css-var and theme-path, we use the
 * stored spelling as-is.
 */
export function spellingForProperty(token: Token, property: string): TokenUsage {
  const usage = token.usage
  if (usage.kind !== 'utility') return usage
  const verb = verbForProperty(property)
  if (!verb) return usage
  const bare = stripVerb(usage.className)
  // `rounded`/`rounded-tl` etc. are valid verb-less when the bare name is empty
  // (the default radius). Drop the trailing dash instead of double-prefixing.
  if (!bare && verb.startsWith('rounded')) {
    return { kind: 'utility', className: verb.replace(/-$/, '') }
  }
  return { kind: 'utility', className: `${verb}${bare}` }
}

/**
 * The `source` payload to attach to a patch/change when a value was bound to a
 * token (picker pick, typed-value match, or snap-to-token). The agent writes
 * `usage` in source instead of the resolved value. Shared by the design-pane
 * `applyTokenAll` and the on-canvas drag commits.
 */
export function tokenSourceFor(token: Token, property: string): TokenSource {
  return {
    tokenId: token.id,
    tokenName: token.name,
    usage: spellingForProperty(token, property),
    resolvedValue: token.value,
  }
}

/** Bare token name with any utility verb stripped — for the Design System
 *  page's reference display (`primary`, `border`, `radius`), where the verb is
 *  contextual and shouldn't be baked into the chip. */
export function bareDisplayName(token: Token): string {
  if (token.usage.kind === 'utility') return stripVerb(token.usage.className) || token.name
  return token.name
}

/**
 * Inline "bound to token" label for a numeric input — the same bare,
 * verb-stripped name the token picker shows (`bareDisplayName`), so the label
 * matches what the user clicked in the popover. This matters for radius: the
 * CSS var is `--radius` (name `radius`) but its Tailwind spelling is `rounded`,
 * and the scale reads `sm`/`md`/`lg`/`xl` rather than `radius-sm`/… Returns
 * null for no match, so call sites can drop the `?.name ?? null` dance.
 */
export function tokenDisplayLabel(token: Token | null | undefined): string | null {
  return token ? bareDisplayName(token) : null
}
