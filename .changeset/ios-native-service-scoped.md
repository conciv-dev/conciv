---
'@conciv/plugin-ios': patch
'@conciv/app': patch
---

The iOS native bridge in the browser holds no module state: `@conciv/plugin-ios/client` exports `makeNativeService`, a scoped Effect that owns `window.__concivNative`, the `conciv:panel-toggled` listener and the bridge fibers, and the embed's native page owns and closes that scope.
