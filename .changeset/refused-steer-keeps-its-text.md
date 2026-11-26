---
'@conciv/ui-kit-chat': patch
'@internal/frontend-defaults': patch
---

A Steer the engine refuses puts the steered text back first in the composer instead of losing it, and is no longer resent silently. `onSteerError` in the composer handlers now receives the queued item as its second argument: `onSteerError?: (error: unknown, item: QueuedMessage) => void`.
