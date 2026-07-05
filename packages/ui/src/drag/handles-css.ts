/**
 * Pixel's drag handles (`<ResizeHandles>` / `<SpacingHandles>` /
 * `<CornerRadiusHandles>`) are styled entirely with inline styles — they carry
 * no className-based CSS. So there is nothing to inject here.
 *
 * This file is kept (exporting an empty string) only so `styles.ts` can keep
 * its `import { HANDLES_CSS } from './drag/handles-css'` + injection line
 * compiling unchanged. Cursor / user-select normalization for edit mode is
 * already handled in `styles.ts` (`html.pixel-editing …`).
 */
export const HANDLES_CSS = ''
