---
'@conciv/ui-kit-chat': patch
---

A thread row evicted before its deferred measurement no longer records a zero height, so the latest-turn gesture lands in one write and history prepends keep the real thread height.
