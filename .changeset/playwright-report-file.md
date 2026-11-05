---
'@conciv/extension-test-runner': patch
---

The Playwright runner reads the JSON report from a temp file instead of stdout, so stdout lines from Playwright or the app's config no longer break the run.
