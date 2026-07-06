// Stub of the canvas pixel-id resolver. In-app there's no data-pixel-id yet
// (it arrives with the build plugin), so source resolution is a no-op and
// inner-component detection is off. Ported code degrades gracefully.
export interface PixelIdLocation { filePath: string; line: number; column: number }
export interface JsxPropMeta { name: string; sourceText: string; line: number; column: number }
export function resolvePixelId(_id: string): PixelIdLocation | null { return null }
export function componentNameFor(_pixelId: string): string | null { return null }
export function isInnerComponentPixelId(_pixelId: string, _currentComponentName: string): boolean {
  return false
}
