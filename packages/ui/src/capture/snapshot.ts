import { toCanvas } from 'html-to-image'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** Padding (px) added around a drag rectangle so the agent sees surrounding context. */
const RECT_PADDING = 100
/** Grid spacing (px) for the coordinate overlay on full-frame screenshots. */
const GRID_STEP = 50

/** Rasterizes the whole page to a canvas (CSS px), excluding our own overlay. */
async function rasterizeBody(): Promise<HTMLCanvasElement | null> {
  try {
    return await toCanvas(document.body, {
      pixelRatio: 1,
      filter: (node) =>
        !(
          node instanceof Element &&
          Array.from(node.classList ?? []).some((c) => c.startsWith('screenshare-'))
        ),
    })
  } catch (err) {
    console.warn('[screenshare] page rasterization failed:', err)
    return null
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

/** Draws a semi-transparent grid with coordinate labels (client coords). */
function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number, step = GRID_STEP): void {
  ctx.save()
  ctx.lineWidth = 1
  ctx.font = '10px ui-monospace, monospace'
  ctx.textBaseline = 'top'
  for (let x = step; x < w; x += step) {
    ctx.strokeStyle = 'rgba(124, 58, 247, 0.18)'
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, h)
    ctx.stroke()
    ctx.fillStyle = 'rgba(124, 58, 247, 0.75)'
    ctx.fillText(String(x), x + 2, 1)
  }
  for (let y = step; y < h; y += step) {
    ctx.strokeStyle = 'rgba(124, 58, 247, 0.18)'
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(w, y + 0.5)
    ctx.stroke()
    ctx.fillStyle = 'rgba(124, 58, 247, 0.75)'
    ctx.fillText(String(y), 2, y + 1)
  }
  ctx.restore()
}

/**
 * Full-viewport screenshot with a coordinate grid baked in. Captured at recording
 * start and on resume so the agent has a labeled spatial reference. Returns null
 * on failure.
 */
export async function captureFullFrame(): Promise<{ blob: Blob; width: number; height: number } | null> {
  if (typeof document === 'undefined') return null
  const full = await rasterizeBody()
  if (!full) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const out = document.createElement('canvas')
  out.width = vw
  out.height = vh
  const ctx = out.getContext('2d')
  if (!ctx) return null

  // Crop the body raster to the current viewport, then overlay the grid.
  ctx.drawImage(full, window.scrollX, window.scrollY, vw, vh, 0, 0, vw, vh)
  drawGrid(ctx, vw, vh)

  const blob = await toBlob(out)
  return blob ? { blob, width: vw, height: vh } : null
}

/**
 * Screenshot of a drag region, expanded by RECT_PADDING on each side, with the
 * user's rectangle drawn on top — so the agent sees both the selection and its
 * surroundings. Best-effort; returns null on failure.
 */
export async function captureRegion(rect: Rect): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  if (rect.width < 1 || rect.height < 1) return null

  const full = await rasterizeBody()
  if (!full) return null

  // Region (in document coords) expanded by padding, clamped to the canvas.
  const docX = rect.x + window.scrollX
  const docY = rect.y + window.scrollY
  const sx = Math.max(0, docX - RECT_PADDING)
  const sy = Math.max(0, docY - RECT_PADDING)
  const ex = Math.min(full.width, docX + rect.width + RECT_PADDING)
  const ey = Math.min(full.height, docY + rect.height + RECT_PADDING)
  const w = Math.round(ex - sx)
  const h = Math.round(ey - sy)
  if (w < 1 || h < 1) return null

  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(full, sx, sy, w, h, 0, 0, w, h)

  // Draw the user's rectangle (relative to the cropped origin).
  const rx = docX - sx
  const ry = docY - sy
  ctx.strokeStyle = 'rgba(168, 85, 247, 0.95)'
  ctx.lineWidth = 2
  ctx.strokeRect(rx + 0.5, ry + 0.5, rect.width, rect.height)
  ctx.fillStyle = 'rgba(168, 85, 247, 0.95)'
  ctx.font = '11px ui-monospace, monospace'
  ctx.textBaseline = 'bottom'
  ctx.fillText(
    `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}×${Math.round(rect.height)}`,
    rx,
    Math.max(11, ry - 3),
  )

  return await toBlob(out)
}
