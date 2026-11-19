---
'@conciv/plugin-ios': patch
---

The iOS extension is now only the WKWebView bridge that the widget's native page uses: the `ios()` function (the package's main entry) and the `./server` entry are removed, along with the `ios_build`, `ios_run`, `ios_screenshot` and `ios_logs` tools and the iOS system prompt they carried. `@conciv/plugin-ios` replaces them: load it with `plugins: [['@conciv/plugin-ios', {projectRoot, bundleId}]]`.
