---
'@conciv/simulation': patch
'@conciv/plugin-testkit': patch
---

The test engine takes the product's `timeouts` (`firstChunkTimeoutMs`, `eventHeartbeatIntervalMs`, `stopGraceMs`, `pageReplyTimeoutMs`, `queuedActionTimeoutMs`), so a test can shorten a limit instead of waiting it out.
