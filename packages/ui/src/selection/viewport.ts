/**
 * Coordinate seam. In the in-app model there's no canvas zoom/pan, so the
 * viewport→element scale is 1 and the selection math is identity. Kept as a
 * named helper (mirroring Pixel's `canvas/viewport`) so it can become
 * zoom-aware unchanged if the canvas (multiple frames) returns — see
 * complete-refactor.md §6.
 */
export function getViewportScale(): number {
  return 1
}
