---
'@getpixel/ui': minor
'@getpixel/server': minor
---

Add a packaging smoke test that installs the published tarballs into a clean app and
verifies the server connects and edits round-trip, plus a CI gate and a changesets-driven
release pipeline (lockstep versioning, automated version PR + npm publish).
