---
'@conciv/core': patch
'@conciv/harness-testkit': patch
---

A built-in plugin takes its options from its config entry, as any plugin does: `plugins: [['conciv.page', {pageReplyTimeoutMs: 1000}]]` reaches the page plugin's `ctx.options`. The engine's own `pageReplyTimeoutMs` and `queuedActionTimeoutMs` start options, and the test engine's timeouts of the same names, are gone.
