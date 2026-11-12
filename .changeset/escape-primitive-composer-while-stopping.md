---
'@conciv/ui-kit-chat': patch
---

The ui-kit-chat composer no longer sends a second stop when Escape is pressed while the run is already stopping. `useComposer().canCancel()` is now false while the run is stopping, and the new `useComposer().isRunning()` keeps the Stop control on screen (disabled) until the run ends.
