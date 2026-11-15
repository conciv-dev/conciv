---
'@conciv/chat': patch
'@conciv/core': patch
---

A plugin tool that must ask before it runs now always asks, also when its plugin reloads during a chat turn. A call that arrives while plugins reload waits for the reload to finish and runs the tool as it is now, and a tool its plugin no longer offers is refused instead of running from the old copy.
