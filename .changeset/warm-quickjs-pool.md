---
'@conciv/ai': patch
---

The QuickJS Code Mode fallback keeps one warm tinypool worker per chat server instead of booting a worker per execution, so a short `execute_typescript` run takes milliseconds instead of a few hundred. Every execution still gets a fresh QuickJS runtime; a timed out, stopped, crashed or over-limit run retires its worker, and ending all runs shuts the pool down.
