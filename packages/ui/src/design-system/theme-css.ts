/**
 * The Pixel design-system CSS variables, as an injectable string.
 *
 * In Pixel this lives in `theme.css` and is loaded once at the document root by
 * `main.tsx`. The design-system primitives mostly style via inline `COLORS`
 * (the TS mirror in `theme.ts`), but the CSS custom properties + keyframes are
 * injected here too so any `var(--pixel-*)` reference resolves and the spinner
 * animation works.
 *
 * NOTE: Pixel's `theme.css` also contains a global reset (`*`, `html`, `body`,
 * `#root`, scrollbars) meant for Pixel's own standalone document. We inject the
 * SDK into an arbitrary host page, so the reset is intentionally omitted — only
 * the `:root` tokens and the namespaced `pixel-*` keyframe/utility are included.
 */
export const THEME_CSS = `
:root {
  /* Surfaces */
  --pixel-bg-base:       #e8e8e8;
  --pixel-bg-surface:    #ffffff;
  --pixel-bg-elevated:   #f5f5f5;
  --pixel-bg-hover:      #f0f0f0;
  --pixel-bg-active:     #ebebeb;

  /* Borders */
  --pixel-border:        #e0e0e0;
  --pixel-border-subtle: #ebebeb;

  /* Text */
  --pixel-text-primary:   #1a1a1a;
  --pixel-text-secondary: #4a4a4a;
  --pixel-text-muted:     #999999;

  /* Accent (Pixel purple) */
  --pixel-accent:       #7c3aed;
  --pixel-accent-hover: #6d28d9;
  --pixel-accent-dim:   rgba(124, 58, 237, 0.12);
  --pixel-accent-glow:  rgba(124, 58, 237, 0.06);
  --pixel-select:       #4f46e5;
  --pixel-select-match: #818cf8;
  --pixel-select-multi: #3730a3;

  /* Hover (element pre-pick) — distinct hue from selection */
  --pixel-hover-element:     #0d9488;
  --pixel-hover-element-bg:  rgba(13, 148, 136, 0.10);

  /* Inner-component boundary tint */
  --pixel-inner-component:    #ea580c;
  --pixel-inner-component-bg: rgba(234, 88, 12, 0.08);

  /* Semantic */
  --pixel-green:  #16a34a;
  --pixel-red:    #dc2626;
  --pixel-yellow: #d97706;
  --pixel-blue:   #2563eb;

  /* Typography */
  --pixel-font-ui:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --pixel-font-mono:  "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  --pixel-fs-xs:   10px;
  --pixel-fs-sm:   11px;
  --pixel-fs-base: 12px;
  --pixel-fs-md:   13px;
  --pixel-fs-lg:   14px;
  --pixel-fs-xl:   16px;

  /* Radii */
  --pixel-radius-sm: 4px;
  --pixel-radius-md: 6px;
  --pixel-radius-lg: 8px;

  /* Elevation */
  --pixel-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06);
  --pixel-shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --pixel-shadow-lg: 0 4px 24px rgba(0, 0, 0, 0.12);
  --pixel-shadow-frame: 0 2px 24px rgba(0, 0, 0, 0.18), 0 0 0 0.5px rgba(0, 0, 0, 0.08);
}

@keyframes pixel-spin {
  to { transform: rotate(360deg); }
}
.pixel-spin {
  animation: pixel-spin 0.8s linear infinite;
  transform-origin: 50% 50%;
}
`
