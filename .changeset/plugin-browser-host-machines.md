---
'@internal/frontend-defaults': patch
'@conciv/backend-plugin-api': patch
'@conciv/protocol': patch
'@conciv/backend': patch
'@conciv/unplugin': patch
---

The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/frontend-plugin-api/host` now exports `BridgePluginExperimental` and `BridgePluginExperimentals`, the list of plugin browser parts to run. `Storage.store` takes the `project` scope, the repo the engine runs in, as declared stores do. A settings key may now be up to 512 characters, so a plugin store named after a long package name fits. `editor.open` and the `open` tool take an optional `column` beside `line`, and the editor opens at that column; a column without a line is ignored.
