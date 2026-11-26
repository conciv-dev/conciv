---
'@conciv/backend': patch
---

The engine takes two internal timing options beside its first-chunk timeout and its heartbeat interval: `pageReplyTimeoutMs`, how long a browser tab has to answer a page query (and to accept a page action queue), 5 seconds by default, and `queuedActionTimeoutMs`, how long each queued page action has to confirm once the tab reaches it, 7 seconds by default. Neither is a config-file key nor a `start()` option; the defaults are unchanged.
