---
"@getpixel/server": minor
---

Extract design tokens from plain CSS custom properties. The `css-vars-fallback`
adapter previously returned nothing, so any app not using shadcn or Tailwind had
an empty design pane. It now reads `--name: value` declarations from `:root`,
`html`, and `:host` blocks, classifies them by name *and* value (so
`--z-modal: 100` isn't a colour), and notes any `.dark` / `[data-theme="dark"]`
override. It still only wins when no library-specific adapter matches.
