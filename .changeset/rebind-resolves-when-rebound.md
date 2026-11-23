---
'@conciv/embed': patch
---

`handle.rebind(apiBase)` resolves only once the widget is rebound: it waits for the new engine's trust check, and the widget leaves the old engine's session instead of reopening its id on the new engine. A host that opens the panel right after `await rebind()` now sees the new engine's latest session, not a blank one.
