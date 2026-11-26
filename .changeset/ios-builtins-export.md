---
'@conciv/plugin-ios': patch
---

`@conciv/plugin-ios/client` is replaced by `@conciv/plugin-ios/builtins`: its `builtins` is a scoped Effect giving the built-ins list the widget's native page composes in, the native `grabProvider` and the engine `apiBase`, so `@conciv/app` names no iOS internals.
