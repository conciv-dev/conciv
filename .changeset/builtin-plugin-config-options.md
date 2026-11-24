---
'@conciv/core': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
'@conciv/app': patch
'@conciv/plugin': patch
---

A built-in plugin takes its options from its config entry, as any plugin does: `plugins: [['conciv.page', {pageReplyTimeoutMs: 1000}]]` reaches the page plugin's `ctx.options` in the engine, and the plugin list carries those options to the plugin's window part, as a package plugin's bundle does. The window part of the page plugin now has the id `conciv.page`, the same as its engine part. The engine's own `pageReplyTimeoutMs` and `queuedActionTimeoutMs` start options, the test engine's timeouts of the same names, the app's `timings.page` and the kit's `mount({timings})` are gone.
