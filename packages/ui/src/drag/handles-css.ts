/**
 * Styles for the on-element drag handles (`<Handles>`). Injected once by the
 * host; classes are prefixed `screenshare-h-` to avoid clashing with the
 * selection outline (`screenshare-sel-`) or the app's own CSS.
 *
 * The handle squares (8px) carry an accent border (#7c3aed) over a white fill,
 * and per-direction resize cursors. Everything renders above the selection
 * outline (z-index >= 2147483002) so a grab always lands on the handle, never
 * the outline beneath it.
 *
 * Ported close to Pixel's `Handles`/`CornerRadiusHandles` visual model (8px
 * squares, accent border, white fill, transparent edge bands), with Pixel's
 * indigo (#4f46e5) swapped for this repo's accent (#7c3aed).
 */
export const HANDLES_CSS = `
.screenshare-h-root {
  position: fixed;
  pointer-events: none;
  z-index: 2147483002;
}
.screenshare-h-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  margin-left: -4px;
  box-sizing: border-box;
  background: #ffffff;
  border: 1px solid #7c3aed;
  pointer-events: auto;
  touch-action: none;
}
.screenshare-h-edge {
  position: absolute;
  background: transparent;
  pointer-events: auto;
  touch-action: none;
}
/* A small grip above the element (NOT a full-body cover) so the element body
   stays clickable for selection / drill / inline text edit. Grab it to move. */
.screenshare-h-move {
  position: absolute;
  left: 50%;
  top: -22px;
  width: 30px;
  height: 16px;
  transform: translateX(-50%);
  border-radius: 6px;
  background: #7c3aed;
  background-image: radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px);
  background-size: 5px 5px;
  background-position: center;
  cursor: move;
  pointer-events: auto;
  touch-action: none;
}
.screenshare-h-radius {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  margin-left: -4px;
  box-sizing: border-box;
  border-radius: 50%;
  background: #ffffff;
  border: 1px solid #7c3aed;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08);
  pointer-events: auto;
  touch-action: none;
}
.screenshare-h-cursor-nwse { cursor: nwse-resize; }
.screenshare-h-cursor-nesw { cursor: nesw-resize; }
.screenshare-h-cursor-ns { cursor: ns-resize; }
.screenshare-h-cursor-ew { cursor: ew-resize; }
`
