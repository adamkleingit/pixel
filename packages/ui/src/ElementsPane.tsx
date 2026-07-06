import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { COLORS, FONT_SIZE, FONTS } from './design-system'
import { useSelectionStore } from './selection/selection-store'
import { OWN_UI_ATTR } from './own-ui'

/**
 * ElementsPane — the left-docked tab that mirrors the live page DOM as a tree.
 *
 * Ported from Pixel's `ElementTreePane` and adapted to the in-app model: there
 * are no tiles / shadow roots / inner components here — the single surface is
 * the live `document.body`, exactly the root the canvas `Selection` overlay
 * anchors against. Everything Pixel-specific (StoryRef, pixelId resolver,
 * inner-component tint) is dropped; the two-way sync is kept verbatim.
 *
 * Two-way sync with the canvas (via the shared SelectionProvider):
 *   - Canvas selection → matching row(s) highlighted (single + multi).
 *   - Canvas hover      → matching row painted in the distinct hover color.
 *   - Tree row click    → `store.pick` / `store.toggle` (Shift) — the same
 *     store the canvas pointer path writes, so single/multi rules fall out.
 *   - Tree row hover    → `store.setHover`, the same field the canvas hover
 *     writes, so both sources land on one outline.
 *
 * Docking mirrors DesignPane (collapse / drag-resize / reserve layout width),
 * flipped to the left edge (`margin-left` + `--pixel-dock-left`).
 */

const PANE_W = 260
const COLLAPSED_W = 36
const MIN_W = 200
const MAX_W = 480

const ROW_H = 22
const INDENT = 12
const CHEVRON_W = 14

/** The tile id every in-app selection uses (single surface). Matches Selection.tsx. */
const TILE = 'app'

/** Elements never worth showing in the tree — non-visual / chrome nodes. */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'])

/** True for Pixel's own UI (the overlay surface + any body-portaled menu), which
 *  must never appear in — or trigger a rebuild of — the app DOM tree. */
function isOwnUi(el: Element): boolean {
  return (
    el.classList.contains('pixel-overlay') ||
    el.hasAttribute(OWN_UI_ATTR) ||
    el.closest(`.pixel-overlay, [${OWN_UI_ATTR}]`) !== null
  )
}

interface TreeRow {
  /** Stable within a build — DOM path from body (`0/2/1`). Used for React key,
   *  refs, and collapse state. */
  key: string
  element: Element
  /** Indent level. 0 = body's direct children. */
  depth: number
  /** JSX-ish tag label, e.g. `div`. */
  label: string
  /** Secondary hint — `#id` or `.first-class`, dimmed. */
  hint: string
  hasChildren: boolean
}

export function ElementsPane() {
  const { entries, hover, pick, toggle, setHover } = useSelectionStore()

  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(PANE_W)
  // Bumped when the app DOM structure changes (MutationObserver) so the tree
  // re-walks — Element refs from an old build go stale across structural edits.
  const [epoch, setEpoch] = useState(0)

  // Resize by dragging the pane's right edge (mirrors DesignPane's left edge).
  const dragging = useRef(false)
  const dragStart = useRef({ x: 0, w: PANE_W })

  function onResizeDown(e: React.PointerEvent<HTMLDivElement>) {
    if (collapsed) return
    e.preventDefault()
    dragging.current = true
    dragStart.current = { x: e.clientX, w: width }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* no active pointer (e.g. jsdom) — capture is best-effort */
    }
  }
  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    const next = dragStart.current.w + (e.clientX - dragStart.current.x) // drag right → wider
    setWidth(Math.min(MAX_W, Math.max(MIN_W, next)))
  }
  function onResizeUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragging.current) return
    dragging.current = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  // Reserve layout width by shrinking <html> from the left; restore on
  // collapse / unmount. The CSS var lets the floating bar dodge the pane.
  useEffect(() => {
    const html = document.documentElement
    const prevMargin = html.style.marginLeft
    const prevTransition = html.style.transition
    html.style.transition = dragging.current ? 'none' : 'margin-left 160ms ease'
    html.style.marginLeft = `${collapsed ? 0 : width}px`
    html.style.setProperty('--pixel-dock-left', `${collapsed ? COLLAPSED_W : width}px`)
    return () => {
      html.style.marginLeft = prevMargin
      html.style.transition = prevTransition
      html.style.removeProperty('--pixel-dock-left')
    }
  }, [collapsed, width])

  // Re-walk the app DOM on structural changes. Mutations inside Pixel's own UI
  // (the overlay's rAF-driven outline updates, popovers, …) are ignored so the
  // observer doesn't spin on our own chrome. Coalesced to one rebuild per frame.
  useEffect(() => {
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setEpoch((n) => n + 1)
      })
    }
    const observer = new MutationObserver((records) => {
      for (const rec of records) {
        const node = rec.target
        const el = node instanceof Element ? node : node.parentElement
        if (el && !isOwnUi(el)) {
          schedule()
          return
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  const rows = useMemo<TreeRow[]>(
    () => buildTree(document.body),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [epoch],
  )

  // Collapse state — Set of *collapsed* row keys (rows default to expanded).
  // Cleared on every rebuild: keys are DOM-path based and shift under
  // structural edits, so best-effort within a stable tree is the honest scope.
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set())
  useEffect(() => {
    setCollapsedKeys(new Set())
  }, [epoch])

  // Drop rows whose ancestor is collapsed — O(N) walk over the depth-ordered
  // flat list (track the deepest collapsed depth and skip until we re-emerge).
  const visibleRows = useMemo(() => {
    if (collapsedKeys.size === 0) return rows
    const out: TreeRow[] = []
    let cutDepth = Infinity
    for (const row of rows) {
      if (row.depth <= cutDepth) {
        out.push(row)
        cutDepth = collapsedKeys.has(row.key) ? row.depth : Infinity
      }
    }
    return out
  }, [rows, collapsedKeys])

  // Flatten the selection to a single Set for an O(1) per-row check regardless
  // of single/multi mode.
  const selectedSet = useMemo(() => new Set(entries.map((e) => e.element)), [entries])
  const anchor = entries[0]?.element ?? null
  const hoveredEl = hover?.element ?? null

  const toggleCollapse = (key: string) =>
    setCollapsedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <aside
      className={`pixel-pane pixel-pane-left${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { width }}
      aria-label="Elements pane"
      data-pixel-tour="elements"
    >
      {!collapsed && (
        <div
          className="pixel-pane-resize"
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize elements pane"
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
        />
      )}
      <div className="pixel-pane-head">
        {!collapsed && (
          <span className="pixel-pane-title" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <TreeIcon />
            Elements
          </span>
        )}
        <button
          type="button"
          className="pixel-pane-collapse"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? 'Expand elements pane' : 'Collapse elements pane'}
          aria-label={collapsed ? 'Expand elements pane' : 'Collapse elements pane'}
          aria-expanded={!collapsed}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path
              d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <TreeList
          rows={visibleRows}
          collapsedKeys={collapsedKeys}
          onToggleCollapse={toggleCollapse}
          selectedSet={selectedSet}
          hoveredEl={hoveredEl}
          anchor={anchor}
          onPick={(el, shift) => (shift ? toggle(TILE, el) : pick(TILE, el))}
          onHover={(el) => setHover(TILE, el)}
        />
      )}
    </aside>
  )
}

function TreeList({
  rows,
  collapsedKeys,
  onToggleCollapse,
  selectedSet,
  hoveredEl,
  anchor,
  onPick,
  onHover,
}: {
  rows: TreeRow[]
  collapsedKeys: Set<string>
  onToggleCollapse: (key: string) => void
  selectedSet: Set<Element>
  hoveredEl: Element | null
  anchor: Element | null
  onPick: (el: Element, shift: boolean) => void
  onHover: (el: Element | null) => void
}) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const prevAnchor = useRef<Element | null>(null)

  // Scroll the anchor row into view only when the selection actually *changes*
  // to a new element (a canvas pick), not on every rebuild/hover re-render —
  // otherwise the pane yanks back to the selected row mid-scroll. A tree-row
  // click also changes the anchor, but that row is already on screen so
  // `scrollIntoView({ block: 'nearest' })` is a no-op.
  useLayoutEffect(() => {
    if (anchor === prevAnchor.current) return
    prevAnchor.current = anchor
    if (!anchor) return
    const row = rows.find((r) => r.element === anchor)
    if (!row) return
    // Optional-chain the method too — jsdom (tests) has no scrollIntoView.
    rowRefs.current.get(row.key)?.scrollIntoView?.({ block: 'nearest' })
  }, [anchor, rows])

  if (rows.length === 0) {
    return (
      <div className="pixel-pane-body">
        <div className="pixel-pane-empty">No elements on the page.</div>
      </div>
    )
  }

  return (
    <div
      className="pixel-pane-body"
      style={{ padding: '6px 0' }}
      // Clearing hover when the pointer leaves the list lets the canvas hover
      // (page pointermove) resume cleanly.
      onMouseLeave={() => onHover(null)}
    >
      {rows.map((row) => (
        <Row
          key={row.key}
          row={row}
          collapsed={collapsedKeys.has(row.key)}
          onToggleCollapse={() => onToggleCollapse(row.key)}
          selected={selectedSet.has(row.element)}
          hovered={row.element === hoveredEl}
          registerRef={(el) => {
            if (el) rowRefs.current.set(row.key, el)
            else rowRefs.current.delete(row.key)
          }}
          onEnter={() => onHover(row.element)}
          onClick={(shift) => onPick(row.element, shift)}
        />
      ))}
    </div>
  )
}

function Row({
  row,
  collapsed,
  onToggleCollapse,
  selected,
  hovered,
  registerRef,
  onEnter,
  onClick,
}: {
  row: TreeRow
  collapsed: boolean
  onToggleCollapse: () => void
  selected: boolean
  hovered: boolean
  registerRef: (el: HTMLDivElement | null) => void
  onEnter: () => void
  onClick: (shift: boolean) => void
}) {
  let bg = 'transparent'
  let leftBorder = 'transparent'
  if (selected) {
    bg = COLORS.accentDim
    leftBorder = COLORS.select
  } else if (hovered) {
    bg = COLORS.hoverElementBg
    leftBorder = COLORS.hoverElement
  }

  return (
    <div
      ref={registerRef}
      style={{
        // `max-content` lets the row grow past the pane so a deeply-indented
        // label scrolls into view (the body is `overflow-x: auto`); `minWidth:
        // 100%` keeps the selection / hover background spanning the full pane
        // for shallow rows.
        width: 'max-content',
        minWidth: '100%',
        height: ROW_H,
        paddingLeft: 4 + row.depth * INDENT,
        paddingRight: 8,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: bg,
        borderLeft: `2px solid ${leftBorder}`,
        cursor: 'pointer',
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.sm,
        color: COLORS.textPrimary,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
      }}
      onMouseEnter={onEnter}
      onClick={(e) => onClick(e.shiftKey)}
      title={row.label + row.hint}
    >
      <Chevron
        hasChildren={row.hasChildren}
        collapsed={collapsed}
        onToggle={(e) => {
          e.stopPropagation()
          onToggleCollapse()
        }}
      />
      <span>{row.label}</span>
      {row.hint && <span style={{ opacity: 0.5, color: COLORS.textSecondary }}>{row.hint}</span>}
    </div>
  )
}

function Chevron({
  hasChildren,
  collapsed,
  onToggle,
}: {
  hasChildren: boolean
  collapsed: boolean
  onToggle: (e: React.MouseEvent) => void
}) {
  if (!hasChildren) {
    return <span style={{ display: 'inline-block', width: CHEVRON_W }} />
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? 'Expand' : 'Collapse'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: CHEVRON_W,
        height: CHEVRON_W,
        background: 'transparent',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: COLORS.textMuted,
      }}
    >
      <svg
        width="8"
        height="8"
        viewBox="0 0 8 8"
        style={{
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
          transition: 'transform 0.1s',
        }}
      >
        <path
          d="M 1 2 L 4 6 L 7 2"
          stroke="currentColor"
          strokeWidth="1.4"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}

function TreeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" style={{ color: COLORS.textMuted }}>
      <path
        d="M4 5h6M4 12h10M4 19h7M14 5h6M18 5v14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Tree building — walk the live document, skipping Pixel's own UI + noise nodes
// ---------------------------------------------------------------------------

function buildTree(root: HTMLElement): TreeRow[] {
  const rows: TreeRow[] = []
  walk(root, [], 0, rows)
  return rows
}

function walk(node: Node, path: number[], depth: number, rows: TreeRow[]): void {
  let index = 0
  for (const child of Array.from(node.childNodes)) {
    if (!(child instanceof Element)) continue
    if (SKIP_TAGS.has(child.tagName)) continue
    if (isOwnUi(child)) continue

    const childPath = [...path, index]
    index++
    const key = childPath.join('/')
    const childCount = countRenderableChildren(child)

    rows.push({
      key,
      element: child,
      depth,
      label: child.tagName.toLowerCase(),
      hint: hintFor(child),
      hasChildren: childCount > 0,
    })
    walk(child, childPath, depth + 1, rows)
  }
}

/** `#id` (preferred) or `.first-class`, or '' — the dimmed secondary label. */
function hintFor(el: Element): string {
  if (el.id) return `#${el.id}`
  const cls = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)[0]
  return cls ? `.${cls}` : ''
}

function countRenderableChildren(node: Node): number {
  let n = 0
  for (const child of Array.from(node.childNodes)) {
    if (child instanceof Element && !SKIP_TAGS.has(child.tagName) && !isOwnUi(child)) n++
  }
  return n
}
