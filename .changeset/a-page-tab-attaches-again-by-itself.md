---
'@conciv/core': patch
---

A page tab with the conciv panel attaches again by itself after the engine restarts or its connection drops, so an agent can keep driving a page nobody is touching. A tab that attaches while the engine's plugins are still starting now waits for them instead of giving up until the page is reloaded.
