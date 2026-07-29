---
'@getpixel/ui': patch
'@getpixel/server': patch
---

Show authored `color-mix()` (and other non-hex) backgrounds as a custom value in the Design pane instead of opaque black. Also parse Chrome's resolved `color(srgb …)` form so computed colors don't fall back to `#000000`.
