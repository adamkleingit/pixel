---
"@getpixel/server": minor
"@getpixel/ui": patch
---

Require `PIXEL_PROJECT_DIR` when starting the ingest server so design-token extraction always targets the correct app package. Fix Next.js time-travel by aliasing both `react` and Next's compiled/react hook imports through `withPixel`.
