---
'@conciv/app': patch
'@conciv/plugin': patch
---

The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/plugin/experimental/host` now exports `BridgePluginGui` and `BridgePluginGuis`, the list of plugin browser parts to run.
