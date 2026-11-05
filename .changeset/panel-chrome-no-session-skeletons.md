---
'@conciv/app': patch
---

The panel title and status bar render without skeletons while the session list loads. The title falls back to "New session", and the run guard uses the chat's own run state until the session row arrives.
