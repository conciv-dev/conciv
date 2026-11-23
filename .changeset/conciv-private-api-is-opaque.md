---
'@conciv/app': patch
'@conciv/plugin-recorder': patch
'@conciv/plugin-tanstack': patch
'@conciv/plugin-test-runner': patch
'@conciv/plugin-try-it': patch
'@conciv/plugin-whiteboard': patch
---

conciv's private plugin API uses opaque types, as Backstage's `OpaqueType`. A first-party plugin is an ordinary `Plugin.define` plugin: it reads the conciv UI with `readConcivUi(ctx)`, a private contract the app answers, and the plugin stamp is gone. Registries made with `OpaqueRegistry` keep their access, so a public `Registry.define` with the same id never reaches a conciv registry.
