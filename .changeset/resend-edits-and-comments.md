---
"@getpixel/ui": patch
---

Fix the failure toast's **Resend** doing nothing after a failed edit or comment
save. Resend only ever replayed a pending *recording*, so when the ingest server
was down while saving edits or comments the toast appeared but its button was
inert — pressing Save again in the bar was the only way through. Every save path
now registers how to replay itself, and Resend re-runs the caller's whole save
flow, so a recovered save also clears the batch and leaves edit/comment mode
exactly as a first-try Save would. A debounced edit folded into a failed Save is
also kept in history instead of being dropped, so the retry still carries it.
