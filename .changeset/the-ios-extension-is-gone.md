---
'@conciv/plugin-ios': patch
'@conciv/embed': patch
---

`@conciv/extension-ios` is no longer published. Its `ios()` function, its `./server` entry and its `ios_build`, `ios_run`, `ios_screenshot` and `ios_logs` tools are replaced by `@conciv/plugin-ios`: load it with `plugins: [['@conciv/plugin-ios', {projectRoot, bundleId}]]`. The WKWebView bridge the widget's native page uses now lives in `@conciv/plugin-ios` too: the message schemas are `@conciv/plugin-ios/rpc` and the browser half is `@conciv/plugin-ios/client`. When the native app's bridge version does not match, the notice is drawn through the plugin's `page.overlay` slot. The Swift SDK version (the `conciv-swift` mirror tag) now follows `@conciv/plugin-ios`.
