---
'@conciv/app': patch
'@conciv/plugin': patch
---

The widget carries the state machines of the plugin browser host, copied from opencode; nothing runs them yet. The SDK's `@conciv/plugin/experimental/host` now exports `BridgePluginExperimental` and `BridgePluginExperimentals`, the list of plugin browser parts to run.
