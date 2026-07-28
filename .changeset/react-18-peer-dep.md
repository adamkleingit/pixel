---
"@getpixel/ui": patch
---

Document and enforce React 18 for pixel-react time-travel: React 19 removed `ReactCurrentOwner`, which breaks state capture. Peer deps now require `>=18 <19`; console warns specifically when React 19 is detected.
