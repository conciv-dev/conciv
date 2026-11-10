---
'@conciv/ai': patch
---

The QuickJS Code Mode fallback runs on a tinypool worker pool, and tool calls cross to the server thread over birpc instead of a hand-written message protocol.
