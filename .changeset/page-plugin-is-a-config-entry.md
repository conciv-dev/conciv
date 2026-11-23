---
'@conciv/core': patch
'@conciv/unplugin': patch
'@conciv/try': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-page': patch
'@conciv/plugin-terminal': patch
---

Core no longer names the page plugin. Core `start` takes `builtins` (Effect plugins in the plugin host's post slot), and the dev server (`@conciv/unplugin`) and `@conciv/try` pass the page plugin there, so `-conciv.page` still turns it off and it still activates last. The engine options `pageReplyTimeoutMs` and `queuedActionTimeoutMs` are gone from core; they are the page plugin's own options. The test kits load no page plugin: a test that needs it names `@conciv/plugin-page` in its config's `plugins`, with those timeouts as that entry's options.
