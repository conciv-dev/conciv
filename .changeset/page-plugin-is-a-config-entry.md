---
'@conciv/core': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-page': patch
'@conciv/embed': patch
---

Core no longer names the page plugin. The dev server (`@conciv/unplugin`) and `@conciv/try` list the page plugin's package folder in the config's `plugins`, so it is a served plugin with the id `@conciv/plugin-page`, and `-@conciv/plugin-page` turns it off. The engine options `pageReplyTimeoutMs` and `queuedActionTimeoutMs` are gone from core; they are the page plugin's own options. The test kits load no page plugin: a test that needs it names `@conciv/plugin-page` in its config's `plugins`, with those timeouts as that entry's options.
