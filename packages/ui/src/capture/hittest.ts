import type { ElementInfo } from '../types'

const MAX_TEXT = 120
const MAX_DEPTH = 24

function collapseText(el: Element): string | undefined {
  const raw = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (!raw) return undefined
  return raw.length > MAX_TEXT ? raw.slice(0, MAX_TEXT) + '…' : raw
}

function describe(el: Element): ElementInfo {
  const info: ElementInfo = {
    tag: el.tagName.toLowerCase(),
    classes: Array.from(el.classList),
  }
  if (el.id) info.id = el.id
  const text = collapseText(el)
  if (text) info.text = text
  return info
}

function isOwnOverlay(el: Element): boolean {
  return el.classList && Array.from(el.classList).some((c) => c.startsWith('screenshare-'))
}

// Structural nodes we never want in the chain — they carry no useful target
// info (and <html>'s textContent is full of injected scripts in dev).
const SKIP_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'SCRIPT', 'STYLE', 'NOSCRIPT'])

/**
 * Returns the meaningful DOM ancestor chain under (x, y), ordered outermost →
 * innermost (the last entry is the element directly under the cursor). <html>
 * and <body> (and script/style) are excluded. The Screenshare overlay is
 * `pointer-events:none`, so `elementFromPoint` already skips it; any stray
 * `screenshare-*` node is filtered defensively. Stops at <body>/<html> or
 * MAX_DEPTH.
 */
export function describeElementChain(x: number, y: number): ElementInfo[] {
  if (typeof document === 'undefined') return []
  const hit = document.elementFromPoint(x, y)
  if (!hit) return []

  const chain: Element[] = []
  let el: Element | null = hit
  let depth = 0
  while (el && depth < MAX_DEPTH) {
    if (SKIP_TAGS.has(el.tagName)) break
    if (!isOwnOverlay(el)) chain.push(el)
    el = el.parentElement
    depth++
  }
  // chain is innermost → outermost; reverse to outermost → innermost.
  return chain.reverse().map(describe)
}
