// Coordinate seam: no canvas zoom in-app, so the viewport→element scale is 1.
// (Mirrors selection/viewport; drag/* import from here as in Pixel.)
export function getViewportScale(): number {
  return 1
}
