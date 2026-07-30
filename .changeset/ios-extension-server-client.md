---
'@conciv/extension-ios': patch
---

Add the iOS extension server and client halves: `ios.build`/`ios.run`/`ios.screenshot`/`ios.logs` tools over a hermetic `SimctlRunner` seam (inert when unconfigured), the WebView bridge client that installs `window.__concivNative` and exports `makeNativeGrabProvider()`, a core-served native page built from `@conciv/embed`, and the plugin registration that wires it into `@conciv/it`.
