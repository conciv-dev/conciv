---
'@conciv/backend-test-utils': patch
---

The kit gains a `perf` project: `*.perf.test.tsx` files run in a real Chromium and Firefox, only when `--project perf` is asked, never in the default run.
