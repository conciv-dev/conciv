---
'@conciv/core': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-page': patch
---

Core no longer lists the page plugin itself. The dev server (`@conciv/unplugin`), `@conciv/try` and the test kit put it as the last entry of the config's `plugins`, after the project's own plugins, so it still activates last. The engine options `pageReplyTimeoutMs` and `queuedActionTimeoutMs` are gone from core; they are the page plugin entry's own options (the test kit's `timeouts` still sets them).
