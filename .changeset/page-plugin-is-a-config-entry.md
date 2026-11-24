---
'@conciv/core': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-page': patch
'@conciv/embed': patch
---

Core no longer names the page plugin. The dev server (`@conciv/unplugin`) and `@conciv/try` pass the page plugin's package folder as `start`'s `post`, so its engine half keeps the id `conciv.page`, and `-conciv.page` turns it off. The engine options `pageReplyTimeoutMs` and `queuedActionTimeoutMs` are gone from core; they are the page plugin's own options. The test kits load no page plugin: a test that needs it loads `@conciv/plugin-page`, with those timeouts as a `conciv.page` entry's options.
