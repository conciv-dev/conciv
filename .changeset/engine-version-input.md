---
'@conciv/core': patch
'@conciv/harness-testkit': patch
'@conciv/plugin-testkit': patch
---

`makeApp` takes `app: {version}`, the version the engine reports in its `x-conciv-version` header, on every route and on a refused (401) request. Without it the engine reports the core package version, as before. The test kits pass `app` through, so a test can start an engine that reports an older version and see the widget's "the conciv engine is older" notice.
